import type { WhatsAppReply } from "@/lib/whatsapp/replies";
import type { Outcome } from "./actions";
import type { TurnCtx } from "./context";
import type { StepInput, StepParse } from "./flow";
import { IDS } from "./ids";
import { parseDelayMinutes } from "./parsers/delay";
import { parseWhen } from "./parsers/datetime";
import { fromInstant, toInstantIso } from "./parsers/localTime";
import type { ChangeKind, PendingChange } from "./types";
import type { BookingRow } from "@/lib/domain/ports";

async function loadOwnBooking(
  ctx: TurnCtx,
  change: PendingChange,
): Promise<BookingRow | null> {
  const booking = await ctx.db.getBookingById(change.bookingId);
  return booking && booking.customerId === ctx.customer.id ? booking : null;
}

export function startChange(
  ctx: TurnCtx,
  type: ChangeKind,
  bookingId: string,
): void {
  ctx.state.change = { type, bookingId, stage: "collect" };
  ctx.state.step = "CHANGE_REQUEST_DETAILS";
  ctx.state.retries = 0;
}

const summaryOf = (change: PendingChange, bookingNumber: number) => ({
  type: change.type,
  bookingNumber,
  newReturnAt: change.newReturnAt,
  newPickupAt: change.newPickupAt,
  note: change.note,
});

export async function changePrompt(ctx: TurnCtx): Promise<WhatsAppReply[]> {
  const change = ctx.state.change;
  const booking = change ? await loadOwnBooking(ctx, change) : null;
  if (!change || !booking) return [ctx.t.noActiveBooking()];
  if (change.stage === "confirm") {
    return [ctx.t.changeConfirm(summaryOf(change, booking.bookingNumber))];
  }
  return [
    ctx.t.askChangeDetails(change.type, {
      currentReturnAt: booking.returnAt,
      currentPickupAt: booking.pickupAt,
    }),
  ];
}

type Collected =
  | { action: "noop" }
  | { action: "collected"; patch: Partial<PendingChange> }
  | { action: "send" }
  | { action: "recollect" }
  | { action: "abort" };

export async function handleChangeParse(
  input: StepInput,
  ctx: TurnCtx,
): Promise<StepParse> {
  const change = ctx.state.change;
  if (!change)
    return { ok: true, value: { action: "noop" } satisfies Collected };
  const booking = await loadOwnBooking(ctx, change);
  if (!booking)
    return { ok: true, value: { action: "abort" } satisfies Collected };

  if (change.stage === "confirm") {
    if (input.kind === "button") {
      if (input.id.raw === IDS.confirm.yes)
        return { ok: true, value: { action: "send" } satisfies Collected };
      if (input.id.raw === IDS.confirm.change)
        return { ok: true, value: { action: "recollect" } satisfies Collected };
      if (input.id.raw === IDS.confirm.cancel)
        return { ok: true, value: { action: "abort" } satisfies Collected };
    }
    return {
      ok: false,
      reason: "AWAITING_CONFIRMATION",
      replies: await changePrompt(ctx),
    };
  }

  // stage === "collect"
  if (change.type === "CANCELLATION") {
    if (input.kind === "button" && input.id.raw === IDS.confirm.yes) {
      return { ok: true, value: { action: "send" } satisfies Collected };
    }
    if (input.kind === "text" && input.text.trim().length > 0) {
      const note = input.text.trim().slice(0, 300);
      return {
        ok: true,
        value: { action: "collected", patch: { note } } satisfies Collected,
      };
    }
    return { ok: false, reason: "NO_REASON", replies: await changePrompt(ctx) };
  }

  if (input.kind !== "text")
    return { ok: false, reason: "STALE", replies: await changePrompt(ctx) };
  const bad = (): StepParse => ({
    ok: false,
    reason: "NO_MATCH",
    replies: [ctx.t.changeNotUnderstood(change.type)],
  });

  const currentReturn = booking.returnAt ? fromInstant(booking.returnAt) : null;
  const currentPickup = booking.pickupAt ? fromInstant(booking.pickupAt) : null;

  if (change.type === "RETURN_DELAY" && booking.returnAt) {
    const minutes = parseDelayMinutes(input.text);
    if (minutes !== null) {
      const newReturnAt = new Date(
        new Date(booking.returnAt).getTime() + minutes * 60_000,
      ).toISOString();
      ctx.parsed.delayMinutes = minutes;
      return {
        ok: true,
        value: {
          action: "collected",
          patch: { newReturnAt },
        } satisfies Collected,
      };
    }
  }

  const when = parseWhen(input.text, { now: ctx.now, lang: ctx.lang });
  if (!when.ok) {
    if (when.reason === "PAST_DATE")
      return { ok: false, reason: when.reason, replies: [ctx.t.datePast()] };
    return bad();
  }
  const v = when.value;
  ctx.parsed.when = v;

  if (change.type === "PICKUP_TIME_CHANGE") {
    if (!currentPickup) return bad();
    const date = v.date ?? currentPickup.date;
    const time = v.time ?? currentPickup.time;
    return {
      ok: true,
      value: {
        action: "collected",
        patch: { newPickupAt: toInstantIso(date, time) },
      } satisfies Collected,
    };
  }

  // RETURN_DELAY (as a clock time) and EXTENSION both set a new return.
  if (!currentReturn || !booking.returnAt) return bad();
  let date = v.date ?? currentReturn.date;
  const time = v.time ?? currentReturn.time;
  if (v.durationDays !== undefined && !v.date) {
    const base =
      new Date(booking.returnAt).getTime() + v.durationDays * 86_400_000;
    const newReturnAt = new Date(base).toISOString();
    return {
      ok: true,
      value: {
        action: "collected",
        patch: { newReturnAt },
      } satisfies Collected,
    };
  }
  if (!v.date && !v.time) return bad();
  const newReturnAt = toInstantIso(date, time);
  if (new Date(newReturnAt) <= new Date(booking.returnAt)) {
    return {
      ok: false,
      reason: "NOT_LATER",
      replies: [ctx.t.returnBeforePickup()],
    };
  }
  date = fromInstant(newReturnAt).date;
  return {
    ok: true,
    value: { action: "collected", patch: { newReturnAt } } satisfies Collected,
  };
}

export async function applyChange(
  value: Collected,
  ctx: TurnCtx,
): Promise<Outcome> {
  const change = ctx.state.change;
  const stay: Outcome = { replies: [], next: "CHANGE_REQUEST_DETAILS" };
  if (!change || value.action === "noop")
    return { replies: [ctx.t.menu()], next: "MENU", skipPrompt: true };

  switch (value.action) {
    case "abort":
      ctx.state.change = undefined;
      return { replies: [ctx.t.menu()], next: "DONE", skipPrompt: true };
    case "recollect":
      change.stage = "collect";
      return stay;
    case "collected":
      Object.assign(change, value.patch);
      change.stage = "confirm";
      return stay;
    case "send": {
      const booking = await loadOwnBooking(ctx, change);
      if (!booking) {
        ctx.state.change = undefined;
        return {
          replies: [ctx.t.noActiveBooking()],
          next: "MENU",
          skipPrompt: true,
        };
      }
      // Files a change request + owner notification. It never edits the booking.
      const quote = await ctx.deps.requestChange(booking.id, change.type, {
        newReturnAt: change.newReturnAt,
        newPickupAt: change.newPickupAt,
        note: change.note,
      });
      ctx.parsed.changeRequested = change.type;
      const reply = ctx.t.changeSent(summaryOf(change, booking.bookingNumber), {
        additionalRs: quote.quotedAdditionalRs,
        availabilityOk: quote.availabilityOk,
      });
      ctx.state.change = undefined;
      return { replies: [reply], next: "DONE", skipPrompt: true };
    }
  }
}
