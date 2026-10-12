import { cancelBooking } from "@/lib/domain/cancelBooking";
import { DomainError } from "@/lib/domain/errors";
import { escalateBookingToHuman } from "@/lib/domain/escalateBookingToHuman";
import { MINIMUM_RENTAL_DAYS } from "@/lib/domain/config";
import type { WhatsAppReply } from "@/lib/whatsapp/replies";
import {
  availableOptions,
  carNameOf,
  isDraftStatus,
  locationName,
} from "./booking";
import type { TurnCtx } from "./context";
import type { Step } from "./types";

export interface Outcome {
  replies: WhatsAppReply[];
  next: Step;
  /** True when `replies` already include everything to say (don't append the next step's prompt). */
  skipPrompt?: boolean;
}

/** Wipes in-progress booking inputs (not the draft row — that's reused or cancelled explicitly). */
export function resetFlowState(ctx: TurnCtx): void {
  ctx.state.pending = {};
  ctx.state.vehicleId = undefined;
  ctx.state.returnToSummary = undefined;
  ctx.state.change = undefined;
  ctx.state.awaiting = undefined;
  ctx.state.retries = 0;
}

/**
 * Hands the chat to a person: conversation → HUMAN, the customer's active
 * booking → NEEDS_HUMAN (via the domain layer), and an owner notification
 * (not duplicated if one is already open).
 */
export async function escalateToHuman(
  ctx: TurnCtx,
  reason: string,
  type: "NEEDS_HUMAN" | "CASH_ISSUE" = "NEEDS_HUMAN",
): Promise<{
  replies: WhatsAppReply[];
  notifyOwner: { title: string; body: string };
}> {
  await ctx.messaging.setConversationMode(ctx.conversation.id, "HUMAN");
  const active = await ctx.db.getActiveBookingForCustomer(ctx.customer.id);
  if (active) await escalateBookingToHuman(ctx.db, active.id);

  const title =
    type === "CASH_ISSUE"
      ? `${ctx.customer.whatsappNumber} can't pay cash`
      : `${ctx.customer.whatsappNumber} asked for a human`;
  const alreadyOpen = active
    ? await ctx.messaging.hasOpenNotificationForBooking(active.id, type)
    : false;
  if (!alreadyOpen) {
    await ctx.messaging.createOwnerNotification({
      type,
      title,
      body: reason,
      bookingId: active?.id ?? null,
    });
  }
  resetFlowState(ctx);
  ctx.state.step = "MENU";
  ctx.state.unknownStreak = 0;
  return {
    replies: [ctx.t.humanHandoff()],
    notifyOwner: { title, body: reason },
  };
}

/** The customer cancels their own unconfirmed draft (a legal CANCELLED transition via the domain layer). */
export async function cancelOwnDraft(ctx: TurnCtx): Promise<boolean> {
  const id = ctx.state.draftBookingId;
  if (!id) return false;
  const booking = await ctx.db.getBookingById(id);
  if (
    !booking ||
    booking.customerId !== ctx.customer.id ||
    !isDraftStatus(booking.status)
  ) {
    ctx.state.draftBookingId = undefined;
    return false;
  }
  await cancelBooking(
    ctx.db,
    id,
    "customer",
    "Customer cancelled the booking request in chat",
  );
  ctx.state.draftBookingId = undefined;
  return true;
}

/**
 * Maps the booking engine's machine-readable error codes to templated
 * explanations (no LLM). VEHICLE_UNAVAILABLE offers cars that ARE free for
 * the same dates, straight from getAvailableVehicles.
 */
export async function explainDomainError(
  ctx: TurnCtx,
  error: unknown,
  where: {
    step: Step;
    locationId?: string;
    pickupAt?: string;
    returnAt?: string;
    vehicleId?: string;
  },
): Promise<Outcome | null> {
  if (!(error instanceof DomainError)) return null;
  ctx.parsed.domainError = error.code;
  switch (error.code) {
    case "VEHICLE_UNAVAILABLE": {
      const car =
        (await carNameOf(
          ctx,
          where.vehicleId ?? ctx.state.vehicleId ?? null,
        )) ?? "car";
      const alternatives =
        where.pickupAt && where.returnAt
          ? (
              await availableOptions(ctx, where.pickupAt, where.returnAt)
            ).filter((o) => `${o.make} ${o.model}` !== car)
          : [];
      ctx.parsed.alternatives = alternatives.map((a) => `${a.make} ${a.model}`);
      return {
        replies: [ctx.t.vehicleUnavailable(car, alternatives)],
        next: alternatives.length > 0 ? "CHOOSE_CAR" : "PICKUP_DATETIME",
        skipPrompt: true,
      };
    }
    case "INVALID_DATES":
      ctx.state.pending = {};
      return {
        replies: [ctx.t.domainError(error.code)],
        next: "PICKUP_DATETIME",
        skipPrompt: false,
      };
    case "BELOW_MINIMUM_RENTAL":
      ctx.state.pending = {
        ...ctx.state.pending,
        returnDate: undefined,
        returnTime: undefined,
      };
      return {
        replies: [
          ctx.t.domainError(error.code, { minDays: MINIMUM_RENTAL_DAYS }),
        ],
        next: "RETURN_DATETIME",
        skipPrompt: true,
      };
    case "OUTSIDE_OPENING_HOURS": {
      const name = where.locationId
        ? await locationName(ctx, where.locationId)
        : null;
      return {
        replies: [
          ctx.t.domainError(error.code, { locationName: name ?? undefined }),
        ],
        next: where.step,
        skipPrompt: true,
      };
    }
    case "LOCATION_NOT_FOUND":
      return {
        replies: [ctx.t.domainError(error.code)],
        next: where.step,
        skipPrompt: true,
      };
    default:
      return {
        replies: [ctx.t.domainError(error.code)],
        next: where.step,
        skipPrompt: true,
      };
  }
}
