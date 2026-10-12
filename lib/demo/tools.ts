import { z } from "zod";
import { executeTool, type ToolContext } from "@/lib/agent/tools";
import { describeActiveBooking } from "@/lib/agent/context";
import {
  buildCustomerContextSummary,
  resolveActiveBooking,
} from "@/lib/domain/customerContext";
import type { DomainDb, LocationRow } from "@/lib/domain/ports";
import type { MessagingDb } from "@/lib/whatsapp/ports";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp/inbound";

/**
 * Demo tool layer for the n8n chatbot. Each tool is a thin wrapper over the
 * existing agent tool handlers (/lib/agent/tools.ts), which in turn wrap
 * /lib/domain — no business logic lives here.
 *
 * Security: the customer is NEVER a model-supplied id. n8n passes the chat
 * session's whatsapp_number as a fixed parameter and we resolve the customer
 * from it. The booking a tool acts on is derived server-side too (the
 * conversation's tracked draft, or the customer's active booking) — a
 * model-supplied booking id is not accepted. No tool here can touch
 * payment_status (only an authenticated owner action in the dashboard can).
 */

/** Mauritius is UTC+4 all year (no DST) — a naive local date-time is read as Indian/Mauritius time. */
const localDateTime = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
    const instant = new Date(hasZone ? value : `${value.trim()}+04:00`);
    if (Number.isNaN(instant.getTime())) {
      ctx.addIssue({
        code: "custom",
        message: "must be a date-time like 2026-10-12T09:00",
      });
      return z.NEVER;
    }
    return instant.toISOString();
  });

/** Free models send "" for "not known yet" — treat blank as absent. */
const blankToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;
const optionalLocalDateTime = z.preprocess(
  blankToUndefined,
  localDateTime.optional(),
);

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

export const DEMO_TOOL_SCHEMAS = {
  get_fleet: z.object({
    pickup_at: optionalLocalDateTime,
    return_at: optionalLocalDateTime,
  }),
  check_availability: z.object({
    pickup_at: localDateTime,
    return_at: localDateTime,
    category: optionalText,
  }),
  get_knowledge: z.object({ query: z.string().min(1) }),
  start_or_update_booking_draft: z.object({
    vehicle_id: optionalText,
    pickup_at: optionalLocalDateTime,
    return_at: optionalLocalDateTime,
    pickup_location: optionalText,
    dropoff_location: optionalText,
    customer_full_name: optionalText,
  }),
  get_price_quote: z.object({}),
  confirm_booking: z.object({}),
  record_customer_update: z.object({
    type: z.enum(["DELAY", "PICKUP_TIME_CHANGE", "EXTENSION_REQUEST", "OTHER"]),
    details: z.string().min(1).max(1000),
  }),
  escalate_to_human: z.object({
    reason: z.string().min(1).max(1000),
    type: z.enum(["NEEDS_HUMAN", "CASH_ISSUE"]).optional(),
  }),
  get_customer_context: z.object({}),
} as const;

export type DemoToolName = keyof typeof DEMO_TOOL_SCHEMAS;
export const DEMO_TOOL_NAMES = Object.keys(DEMO_TOOL_SCHEMAS) as DemoToolName[];

export type DemoToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface DemoToolDeps {
  domainDb: DomainDb;
  messaging: MessagingDb;
  now?: () => Date;
}

const fail = (code: string, message: string): DemoToolResult => ({
  ok: false,
  error: { code, message },
});

function presentLocation(l: LocationRow) {
  return {
    name: l.name,
    extraFeeRs: l.extraFeeRs,
    openingHours: l.openingHours ?? null,
    afterHoursAllowed: l.afterHoursAllowed ?? false,
    afterHoursFeeRs: l.afterHoursFeeRs ?? 0,
    instructions: l.instructions ?? null,
  };
}

/** Resolves a spoken location name ("grand baie", "airport") to exactly one active location. */
function resolveLocation(
  locations: LocationRow[],
  spoken: string,
): { id: string } | { error: DemoToolResult } {
  const q = spoken.trim().toLowerCase();
  const exact = locations.filter((l) => l.name.toLowerCase() === q);
  const matches =
    exact.length > 0
      ? exact
      : locations.filter(
          (l) =>
            l.name.toLowerCase().includes(q) ||
            q.includes(l.name.toLowerCase()),
        );
  const names = locations.map((l) => l.name).join(", ");
  if (matches.length === 1) return { id: matches[0].id };
  return {
    error: fail(
      "LOCATION_NOT_FOUND",
      matches.length === 0
        ? `No location called "${spoken}". Available locations: ${names}.`
        : `"${spoken}" matches several locations. Be specific: ${matches.map((l) => l.name).join(", ")}.`,
    ),
  };
}

/** Collapses the agent's { ok, data | error } JSON back into a DemoToolResult. */
function fromAgent(result: { content: string }): DemoToolResult {
  return JSON.parse(result.content) as DemoToolResult;
}

/** Offers one bookable vehicle id per model group instead of the internal id list. */
function simplifyGroups(data: unknown): unknown {
  const groups = (data as { groups?: { vehicleIds?: string[] }[] })?.groups;
  if (!Array.isArray(groups)) return data;
  return {
    ...(data as object),
    groups: groups.map(({ vehicleIds, ...rest }) => ({
      ...rest,
      vehicle_id: vehicleIds?.[0] ?? null,
    })),
  };
}

/**
 * Runs one demo tool for the customer identified by `whatsappNumber`.
 * `rawInput` is the (untrusted) model-supplied JSON; it is validated here.
 */
export async function runDemoTool(
  deps: DemoToolDeps,
  whatsappNumber: string,
  tool: DemoToolName,
  rawInput: unknown,
): Promise<DemoToolResult> {
  const parsed = DEMO_TOOL_SCHEMAS[tool].safeParse(rawInput ?? {});
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      parsed.error.issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
        .join("; "),
    );
  }
  const input = parsed.data as Record<string, string | undefined>;
  const now = deps.now?.() ?? new Date();

  const customer = await deps.messaging.findOrCreateCustomer(
    normalizeWhatsAppNumber(whatsappNumber),
  );
  const conversation = await deps.messaging.getOrCreateConversation(
    customer.id,
  );
  const ctx: ToolContext = {
    domainDb: deps.domainDb,
    messaging: deps.messaging,
    customer,
    conversationId: conversation.id,
    state: { ...conversation.state },
    now,
  };
  const persistState = () =>
    deps.messaging.updateConversationState(conversation.id, ctx.state);

  /** The draft this conversation is working on — and only if it belongs to this customer. */
  const ownDraftId = async (): Promise<string | null> => {
    const id = ctx.state.draftBookingId;
    if (typeof id !== "string") return null;
    const booking = await deps.domainDb.getBookingById(id);
    return booking && booking.customerId === customer.id ? id : null;
  };

  switch (tool) {
    case "get_fleet": {
      const result = fromAgent(
        await executeTool(
          "get_fleet",
          { pickupAt: input.pickup_at, returnAt: input.return_at },
          ctx,
        ),
      );
      if (!result.ok) return result;
      const locations = await deps.domainDb.listActiveLocations();
      return {
        ok: true,
        data: {
          ...(simplifyGroups(result.data) as object),
          locations: locations.map(presentLocation),
        },
      };
    }
    case "check_availability": {
      const result = fromAgent(
        await executeTool(
          "check_availability",
          {
            pickupAt: input.pickup_at,
            returnAt: input.return_at,
            category: input.category,
          },
          ctx,
        ),
      );
      return result.ok
        ? { ok: true, data: simplifyGroups(result.data) }
        : result;
    }
    case "get_knowledge":
      return fromAgent(
        await executeTool("get_knowledge", { query: input.query }, ctx),
      );
    case "start_or_update_booking_draft": {
      const fields: Record<string, string | undefined> = {
        vehicleId: input.vehicle_id,
        pickupAt: input.pickup_at,
        returnAt: input.return_at,
        customerFullName: input.customer_full_name,
      };
      if (input.pickup_location || input.dropoff_location) {
        const locations = await deps.domainDb.listActiveLocations();
        for (const [spoken, key] of [
          [input.pickup_location, "pickupLocationId"],
          [input.dropoff_location, "dropoffLocationId"],
        ] as const) {
          if (!spoken) continue;
          const found = resolveLocation(locations, spoken);
          if ("error" in found) return found.error;
          fields[key] = found.id;
        }
      }
      const result = fromAgent(
        await executeTool("start_or_update_booking_draft", fields, ctx),
      );
      await persistState();
      return result;
    }
    case "get_price_quote":
    case "confirm_booking": {
      const bookingId = await ownDraftId();
      if (!bookingId) {
        return fail(
          "NO_DRAFT",
          "There is no booking in progress. Call start_or_update_booking_draft first.",
        );
      }
      const result = fromAgent(await executeTool(tool, { bookingId }, ctx));
      await persistState();
      return result;
    }
    case "escalate_to_human":
      return fromAgent(await executeTool(tool, input, ctx));
    case "record_customer_update": {
      const resolution = await resolveActiveBooking(
        deps.domainDb,
        customer.id,
        now,
      );
      if (resolution.ambiguous || !resolution.booking) {
        return fail(
          resolution.ambiguous ? "AMBIGUOUS_BOOKING" : "NO_ACTIVE_BOOKING",
          resolution.ambiguous
            ? "The customer has several active bookings. Ask which booking number they mean, or escalate to a human."
            : "The customer has no active booking to attach this to. Escalate to a human if it needs action.",
        );
      }
      return fromAgent(
        await executeTool(
          "record_customer_update",
          { ...input, bookingId: resolution.booking.id },
          ctx,
        ),
      );
    }
    case "get_customer_context": {
      const resolution = await resolveActiveBooking(
        deps.domainDb,
        customer.id,
        now,
      );
      const active =
        resolution.booking && !resolution.ambiguous
          ? await describeActiveBooking(deps.domainDb, resolution.booking)
          : null;
      return {
        ok: true,
        data: {
          summary: await buildCustomerContextSummary(
            { domainDb: deps.domainDb, messaging: deps.messaging },
            customer.id,
            now,
          ),
          activeBooking: active && {
            bookingNumber: active.booking.bookingNumber,
            status: active.booking.status,
            vehicle: [active.vehicleMake, active.vehicleModel]
              .filter(Boolean)
              .join(" "),
            pickupAt: active.booking.pickupAt,
            returnAt: active.booking.returnAt,
            pickupLocation: active.pickupLocationName,
            dropoffLocation: active.dropoffLocationName,
            totalRs: active.booking.totalRs,
            paymentStatus: active.booking.paymentStatus,
            documentStatus: active.booking.documentStatus,
          },
          ambiguousBookings: resolution.ambiguous
            ? resolution.candidates.map((b) => ({
                bookingNumber: b.bookingNumber,
                status: b.status,
              }))
            : [],
        },
      };
    }
  }
}
