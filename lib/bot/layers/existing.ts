import { textReply } from "@/lib/whatsapp/replies";
import { buildStatusCard, isDraftStatus } from "../booking";
import { changePrompt, startChange } from "../changeRequest";
import type { TurnCtx } from "../context";
import type { Handled } from "../handled";
import { IDS, type ParsedId } from "../ids";
import type { ChangeKind } from "../types";
import { escalateToHuman } from "../actions";

const REQ_TYPE: Record<string, ChangeKind> = {
  [IDS.req.delay]: "RETURN_DELAY",
  [IDS.req.extension]: "EXTENSION",
  [IDS.req.pickupChange]: "PICKUP_TIME_CHANGE",
  [IDS.req.cancel]: "CANCELLATION",
};

export const INTENT_TO_CHANGE: Record<string, ChangeKind> = {
  delay: "RETURN_DELAY",
  extension: "EXTENSION",
  pickup_change: "PICKUP_TIME_CHANGE",
};

/**
 * The existing-booking layer. Shows a status card built only from database
 * rows and opens a change-request flow; it never edits the booking and never
 * promises approval (see changeRequest.ts).
 */
export async function showBooking(
  ctx: TurnCtx,
  matched: string,
  type?: ChangeKind,
): Promise<Handled> {
  const resolution = await ctx.getResolution();
  const handledBy = "existing_booking" as const;

  if (
    resolution.ambiguous &&
    resolution.reason !== "DRAFT" &&
    !ctx.state.selectedBookingId
  ) {
    ctx.state.step = "EXISTING_BOOKING_MENU";
    if (type) ctx.state.change = { type, bookingId: "", stage: "collect" };
    return {
      replies: [
        ctx.t.chooseBooking(
          resolution.candidates
            .filter((b) => !isDraftStatus(b.status))
            .map((b) => ({
              id: b.id,
              bookingNumber: b.bookingNumber,
              label: b.status,
            })),
        ),
      ],
      handledBy,
      matched,
    };
  }

  const booking = await ctx.getActiveBooking();
  if (!booking) {
    ctx.state.step = "MENU";
    return {
      replies: [ctx.t.noActiveBooking()],
      handledBy,
      matched: `${matched}:none`,
    };
  }
  ctx.parsed.bookingNumber = booking.bookingNumber;

  if (type) {
    startChange(ctx, type, booking.id);
    return {
      replies: await changePrompt(ctx),
      handledBy,
      matched: `${matched}:${type}`,
    };
  }
  ctx.state.step = "EXISTING_BOOKING_MENU";
  ctx.state.retries = 0;
  return {
    replies: [ctx.t.statusCard(await buildStatusCard(ctx, booking))],
    handledBy,
    matched,
  };
}

/** `req:*` buttons and the `bk:<id>` booking picker. */
export async function handleExistingButton(
  ctx: TurnCtx,
  id: ParsedId,
): Promise<Handled | null> {
  if (id.kind === "bk") {
    const r = await ctx.getResolution();
    const chosen = r.candidates.find((b) => b.id === id.value);
    if (!chosen) return showBooking(ctx, "bk:stale");
    ctx.state.selectedBookingId = chosen.id;
    const pending = ctx.state.change;
    if (pending && !pending.bookingId) {
      return showBooking(ctx, "bk", pending.type);
    }
    return showBooking(ctx, "bk");
  }
  if (id.kind === "req") {
    const type = REQ_TYPE[id.raw];
    if (!type) return null;
    return showBooking(ctx, id.raw, type);
  }
  return null;
}

/** "I already paid": never confirm it; tell the team. The bot has no way to mark anything paid. */
export async function handlePaymentClaim(
  ctx: TurnCtx,
  text: string,
): Promise<Handled> {
  const booking = await ctx.getActiveBooking();
  const alreadyOpen = booking
    ? await ctx.messaging.hasOpenNotificationForBooking(booking.id, "OTHER")
    : false;
  if (!alreadyOpen) {
    await ctx.messaging.createOwnerNotification({
      type: "OTHER",
      title: `${ctx.customer.whatsappNumber} says they have paid`,
      body: text.slice(0, 500),
      bookingId: booking?.id ?? null,
    });
  }
  return {
    replies: [ctx.t.paymentClaim()],
    handledBy: "faq",
    matched: "intent:payment_claim",
    notifyOwner: {
      title: `${ctx.customer.whatsappNumber} says they have paid`,
      body: text,
    },
  };
}

export async function handleTalkToHuman(
  ctx: TurnCtx,
  handledBy: "button" | "command" | "llm_fallback",
  text: string,
): Promise<Handled> {
  const esc = await escalateToHuman(ctx, text);
  return {
    replies: esc.replies,
    handledBy,
    matched: "human",
    notifyOwner: esc.notifyOwner,
  };
}

export { textReply };
