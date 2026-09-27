import type Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "@/lib/env";
import { DomainError } from "@/lib/domain/errors";
import { getFleet } from "@/lib/domain/getFleet";
import { getAvailableVehicles } from "@/lib/domain/getAvailableVehicles";
import { searchKnowledgeBase } from "@/lib/domain/knowledgeBase";
import { createBookingDraft } from "@/lib/domain/createBookingDraft";
import {
  updateBookingDraft,
  type UpdateBookingDraftFields,
} from "@/lib/domain/updateBookingDraft";
import { calculatePrice } from "@/lib/domain/calculatePrice";
import { confirmBooking } from "@/lib/domain/confirmBooking";
import { escalateBookingToHuman } from "@/lib/domain/escalateBookingToHuman";
import type { BookingRow, DomainDb } from "@/lib/domain/ports";
import { formatBookingSummaryText } from "@/lib/whatsapp/format";
import type {
  ConversationState,
  CustomerRow,
  MessagingDb,
  OwnerNotificationType,
} from "@/lib/whatsapp/ports";
import { describeActiveBooking } from "./context";

export interface ToolContext {
  domainDb: DomainDb;
  messaging: MessagingDb;
  customer: CustomerRow;
  conversationId: string;
  /** Mutated in place across the turn's tool calls, then persisted once by runAgent. */
  state: ConversationState;
  now: Date;
}

export interface ToolExecutionResult {
  /** JSON text handed back to the model as the tool_result content. */
  content: string;
  isError: boolean;
}

function ok(data: unknown): ToolExecutionResult {
  return { content: JSON.stringify({ ok: true, data }), isError: false };
}

function fail(code: string, message: string): ToolExecutionResult {
  return {
    content: JSON.stringify({ ok: false, error: { code, message } }),
    isError: true,
  };
}

async function summarizeBooking(domainDb: DomainDb, booking: BookingRow) {
  const described = await describeActiveBooking(domainDb, booking);
  return {
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    vehicleId: booking.vehicleId,
    vehicleMake: described.vehicleMake,
    vehicleModel: described.vehicleModel,
    pickupAt: booking.pickupAt,
    returnAt: booking.returnAt,
    pickupLocationId: booking.pickupLocationId,
    pickupLocationName: described.pickupLocationName,
    dropoffLocationId: booking.dropoffLocationId,
    dropoffLocationName: described.dropoffLocationName,
    totalRs: booking.totalRs,
    paymentStatus: booking.paymentStatus,
    documentStatus: booking.documentStatus,
  };
}

async function resolveCategoryId(
  domainDb: DomainDb,
  category: string | undefined,
): Promise<string | undefined> {
  if (!category) return undefined;
  const categories = await domainDb.listVehicleCategories();
  const match = categories.find(
    (c) => c.name.toLowerCase() === category.trim().toLowerCase(),
  );
  return match?.id;
}

async function toolGetFleet(
  ctx: ToolContext,
  input: { pickupAt?: string; returnAt?: string },
): Promise<ToolExecutionResult> {
  try {
    const groups = await getFleet(ctx.domainDb, {
      pickupAt: input.pickupAt,
      returnAt: input.returnAt,
    });
    return ok({ groups });
  } catch (error) {
    if (error instanceof DomainError) return fail(error.code, error.message);
    throw error;
  }
}

async function toolCheckAvailability(
  ctx: ToolContext,
  input: { pickupAt: string; returnAt: string; category?: string },
): Promise<ToolExecutionResult> {
  try {
    const categoryId = await resolveCategoryId(ctx.domainDb, input.category);
    const groups = await getAvailableVehicles(ctx.domainDb, {
      pickupAt: input.pickupAt,
      returnAt: input.returnAt,
      categoryId,
    });
    return ok({ groups });
  } catch (error) {
    if (error instanceof DomainError) return fail(error.code, error.message);
    throw error;
  }
}

async function toolGetKnowledge(
  ctx: ToolContext,
  input: { query: string },
): Promise<ToolExecutionResult> {
  const entries = await searchKnowledgeBase(ctx.domainDb, input.query);
  return ok({ entries });
}

async function startFreshDraft(ctx: ToolContext): Promise<string> {
  const draft = await createBookingDraft(ctx.domainDb, ctx.customer.id);
  ctx.state.draftBookingId = draft.id;
  ctx.state.summaryShown = false;
  return draft.id;
}

async function toolStartOrUpdateBookingDraft(
  ctx: ToolContext,
  input: {
    vehicleId?: string;
    pickupAt?: string;
    returnAt?: string;
    pickupLocationId?: string;
    dropoffLocationId?: string;
    customerFullName?: string;
  },
): Promise<ToolExecutionResult> {
  if (input.customerFullName) {
    await ctx.messaging.updateCustomerFullName(
      ctx.customer.id,
      input.customerFullName,
    );
  }

  const fields: UpdateBookingDraftFields = {};
  if (input.vehicleId !== undefined) fields.vehicleId = input.vehicleId;
  if (input.pickupAt !== undefined) fields.pickupAt = input.pickupAt;
  if (input.returnAt !== undefined) fields.returnAt = input.returnAt;
  if (input.pickupLocationId !== undefined)
    fields.pickupLocationId = input.pickupLocationId;
  if (input.dropoffLocationId !== undefined)
    fields.dropoffLocationId = input.dropoffLocationId;

  let draftBookingId = ctx.state.draftBookingId as string | undefined;
  if (!draftBookingId) draftBookingId = await startFreshDraft(ctx);

  try {
    const booking = await updateBookingDraft(
      ctx.domainDb,
      draftBookingId,
      fields,
    );
    return ok(await summarizeBooking(ctx.domainDb, booking));
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.code === "ILLEGAL_TRANSITION") {
        // The tracked draft moved past the editable draft stages (e.g. a
        // previous booking was confirmed/completed) — start a new one and
        // retry once rather than surfacing a confusing error to the model.
        draftBookingId = await startFreshDraft(ctx);
        try {
          const booking = await updateBookingDraft(
            ctx.domainDb,
            draftBookingId,
            fields,
          );
          return ok(await summarizeBooking(ctx.domainDb, booking));
        } catch (retryError) {
          if (retryError instanceof DomainError)
            return fail(retryError.code, retryError.message);
          throw retryError;
        }
      }
      return fail(error.code, error.message);
    }
    throw error;
  }
}

async function toolGetPriceQuote(
  ctx: ToolContext,
  input: { bookingId: string },
): Promise<ToolExecutionResult> {
  const booking = await ctx.domainDb.getBookingById(input.bookingId);
  if (!booking)
    return fail("BOOKING_NOT_FOUND", "That booking id doesn't exist.");
  if (
    !booking.vehicleId ||
    !booking.pickupAt ||
    !booking.returnAt ||
    !booking.pickupLocationId
  ) {
    return fail(
      "INCOMPLETE_BOOKING",
      "This booking is still missing a car, dates or a pickup location — collect those first.",
    );
  }

  try {
    const price = await calculatePrice(ctx.domainDb, {
      vehicleId: booking.vehicleId,
      pickupAt: booking.pickupAt,
      returnAt: booking.returnAt,
      pickupLocationId: booking.pickupLocationId,
      dropoffLocationId: booking.dropoffLocationId ?? undefined,
      extrasRs: booking.extrasRs,
    });
    const described = await describeActiveBooking(ctx.domainDb, booking);

    if (booking.id === ctx.state.draftBookingId) ctx.state.summaryShown = true;

    const summaryText =
      described.vehicleMake &&
      described.vehicleModel &&
      described.pickupLocationName
        ? formatBookingSummaryText({
            vehicleMake: described.vehicleMake,
            vehicleModel: described.vehicleModel,
            pickupAt: booking.pickupAt,
            returnAt: booking.returnAt,
            pickupLocationName: described.pickupLocationName,
            dropoffLocationName: described.dropoffLocationName ?? undefined,
            rentalDays: price.rentalDays,
            lineItems: price.lineItems,
            totalRs: price.totalRs,
          })
        : null;

    return ok({
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      ...price,
      summaryText,
    });
  } catch (error) {
    if (error instanceof DomainError) return fail(error.code, error.message);
    throw error;
  }
}

async function toolConfirmBooking(
  ctx: ToolContext,
  input: { bookingId: string },
): Promise<ToolExecutionResult> {
  const isTrackedDraft = input.bookingId === ctx.state.draftBookingId;
  if (!isTrackedDraft || ctx.state.summaryShown !== true) {
    return fail(
      "SUMMARY_NOT_CONFIRMED",
      "Present the booking summary with get_price_quote and get the customer's explicit confirmation before calling confirm_booking.",
    );
  }

  try {
    const booking = await confirmBooking(
      ctx.domainDb,
      input.bookingId,
      ctx.now,
    );
    ctx.state.summaryShown = false;
    return ok(await summarizeBooking(ctx.domainDb, booking));
  } catch (error) {
    if (error instanceof DomainError) return fail(error.code, error.message);
    throw error;
  }
}

async function toolSendDocumentUploadLink(
  ctx: ToolContext,
  input: { bookingId: string },
): Promise<ToolExecutionResult> {
  const booking = await ctx.domainDb.getBookingById(input.bookingId);
  if (!booking)
    return fail("BOOKING_NOT_FOUND", "That booking id doesn't exist.");
  if (!booking.uploadToken) {
    return fail(
      "NO_UPLOAD_TOKEN",
      "This booking doesn't have a document upload link yet — call confirm_booking first.",
    );
  }

  const { APP_URL } = requireEnv(process.env, ["APP_URL"]);
  return ok({
    url: `${APP_URL}/documents/${booking.uploadToken}`,
    expiresAt: booking.uploadTokenExpiresAt,
  });
}

const CUSTOMER_UPDATE_TYPE_MAP: Record<string, OwnerNotificationType> = {
  DELAY: "DELAY",
  PICKUP_TIME_CHANGE: "PICKUP_CHANGE",
  EXTENSION_REQUEST: "EXTENSION_REQUEST",
  OTHER: "OTHER",
};

async function toolRecordCustomerUpdate(
  ctx: ToolContext,
  input: {
    bookingId: string;
    type: "DELAY" | "PICKUP_TIME_CHANGE" | "EXTENSION_REQUEST" | "OTHER";
    details: string;
  },
): Promise<ToolExecutionResult> {
  const booking = await ctx.domainDb.getBookingById(input.bookingId);
  if (!booking)
    return fail("BOOKING_NOT_FOUND", "That booking id doesn't exist.");

  const type = CUSTOMER_UPDATE_TYPE_MAP[input.type];
  await ctx.messaging.createOwnerNotification({
    type,
    title: `${input.type.replace(/_/g, " ").toLowerCase()} request — booking #${booking.bookingNumber}`,
    body: input.details,
    bookingId: booking.id,
  });
  return ok({ recorded: true });
}

async function toolEscalateToHuman(
  ctx: ToolContext,
  input: { reason: string },
): Promise<ToolExecutionResult> {
  await ctx.messaging.setConversationMode(ctx.conversationId, "HUMAN");

  const activeBooking = await ctx.domainDb.getActiveBookingForCustomer(
    ctx.customer.id,
  );
  if (activeBooking) {
    await escalateBookingToHuman(ctx.domainDb, activeBooking.id);
  }

  await ctx.messaging.createOwnerNotification({
    type: "NEEDS_HUMAN",
    title: `${ctx.customer.whatsappNumber} needs a human`,
    body: input.reason,
    bookingId: activeBooking?.id ?? null,
  });

  return ok({ escalated: true });
}

type ToolHandler = (
  ctx: ToolContext,
  input: never,
) => Promise<ToolExecutionResult>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  get_fleet: toolGetFleet as ToolHandler,
  check_availability: toolCheckAvailability as ToolHandler,
  get_knowledge: toolGetKnowledge as ToolHandler,
  start_or_update_booking_draft: toolStartOrUpdateBookingDraft as ToolHandler,
  get_price_quote: toolGetPriceQuote as ToolHandler,
  confirm_booking: toolConfirmBooking as ToolHandler,
  send_document_upload_link: toolSendDocumentUploadLink as ToolHandler,
  record_customer_update: toolRecordCustomerUpdate as ToolHandler,
  escalate_to_human: toolEscalateToHuman as ToolHandler,
};

export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return fail("UNKNOWN_TOOL", `No such tool: ${name}`);
  }
  return handler(ctx, input as never);
}

/** Anthropic tool schemas — see prompts/05-ai-conversation-agent.md for the exact contract each one implements. */
export const AGENT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "get_fleet",
    description:
      "Lists the full fleet, grouped by make/model. Pass pickupAt/returnAt (both or neither) to include live availability counts per group.",
    input_schema: {
      type: "object",
      properties: {
        pickupAt: { type: "string", description: "ISO 8601 instant" },
        returnAt: { type: "string", description: "ISO 8601 instant" },
      },
    },
  },
  {
    name: "check_availability",
    description:
      'Lists vehicle groups available for a specific date range, optionally filtered by category (e.g. "SUV", "Economy").',
    input_schema: {
      type: "object",
      properties: {
        pickupAt: { type: "string", description: "ISO 8601 instant" },
        returnAt: { type: "string", description: "ISO 8601 instant" },
        category: { type: "string" },
      },
      required: ["pickupAt", "returnAt"],
    },
  },
  {
    name: "get_knowledge",
    description:
      "Searches the knowledge base for an answer to a specific customer question. Most FAQs are already in your system prompt — use this for anything not already covered there.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "start_or_update_booking_draft",
    description:
      "Creates the customer's booking draft on first use and updates it on every later call. Pass only the fields you're setting or changing — omitted fields keep their current value. customerFullName must be exactly as printed on their passport/driving permit.",
    input_schema: {
      type: "object",
      properties: {
        vehicleId: { type: "string" },
        pickupAt: { type: "string", description: "ISO 8601 instant" },
        returnAt: { type: "string", description: "ISO 8601 instant" },
        pickupLocationId: { type: "string" },
        dropoffLocationId: { type: "string" },
        customerFullName: { type: "string" },
      },
    },
  },
  {
    name: "get_price_quote",
    description:
      "Returns the priced summary for a booking (car, dates, locations, price breakdown, total) and a ready-to-send summaryText. Always call this before asking the customer to confirm.",
    input_schema: {
      type: "object",
      properties: { bookingId: { type: "string" } },
      required: ["bookingId"],
    },
  },
  {
    name: "confirm_booking",
    description:
      "Locks in the booking and generates the document upload link, moving it to PENDING_DOCUMENTS. Only call this after the customer has explicitly confirmed the summary from get_price_quote.",
    input_schema: {
      type: "object",
      properties: { bookingId: { type: "string" } },
      required: ["bookingId"],
    },
  },
  {
    name: "send_document_upload_link",
    description:
      "Returns the secure link where the customer uploads their passport/driving permit, for a booking already confirmed via confirm_booking.",
    input_schema: {
      type: "object",
      properties: { bookingId: { type: "string" } },
      required: ["bookingId"],
    },
  },
  {
    name: "record_customer_update",
    description:
      "Logs a delay, pickup-time change, extension request or other update for the team to action — never approves it. Tell the customer the team will confirm.",
    input_schema: {
      type: "object",
      properties: {
        bookingId: { type: "string" },
        type: {
          type: "string",
          enum: ["DELAY", "PICKUP_TIME_CHANGE", "EXTENSION_REQUEST", "OTHER"],
        },
        details: { type: "string" },
      },
      required: ["bookingId", "type", "details"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hands the conversation to a human team member: complaints, accidents/damage, payment difficulties, anything outside normal policy, repeated confusion, or an explicit request for a person. After calling this, give a brief closing reply and stop.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
];
