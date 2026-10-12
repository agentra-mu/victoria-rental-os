import { startBookingFlow } from "../startFlow";
import type { TurnCtx } from "../context";
import type { Handled } from "../handled";
import type { IntentKey } from "../lexicon";
import type { HandledBy } from "../types";
import { escalateToHuman } from "../actions";
import { enterStep } from "../flow";
import { handlePaymentClaim, INTENT_TO_CHANGE, showBooking } from "./existing";

/** Maps a keyword-matched (or LLM-classified) intent to the same action its button would trigger. */
export async function routeIntent(
  ctx: TurnCtx,
  intent: string,
  text: string,
  handledBy: HandledBy = "state_machine",
): Promise<Handled | null> {
  switch (intent as IntentKey) {
    case "view_cars":
      return {
        replies: await startBookingFlow(ctx, "fleet"),
        handledBy,
        matched: "intent:view_cars",
      };
    case "check_availability":
      return {
        replies: await startBookingFlow(ctx, "availability"),
        handledBy,
        matched: "intent:check_availability",
      };
    case "existing_booking":
      return {
        ...(await showBooking(ctx, "intent:existing_booking")),
        handledBy:
          handledBy === "state_machine" ? "existing_booking" : handledBy,
      };
    case "delay":
    case "extension":
    case "pickup_change":
      return {
        ...(await showBooking(
          ctx,
          `intent:${intent}`,
          INTENT_TO_CHANGE[intent],
        )),
        handledBy:
          handledBy === "state_machine" ? "existing_booking" : handledBy,
      };
    case "payment_claim":
      return handlePaymentClaim(ctx, text);
    case "upload_link": {
      const booking = await ctx.getActiveBooking();
      if (!booking)
        return {
          replies: [ctx.t.noActiveBooking()],
          handledBy,
          matched: "intent:upload_link:none",
        };
      return {
        replies: await enterStep(ctx, "AWAITING_DOCUMENTS"),
        handledBy:
          handledBy === "state_machine" ? "existing_booking" : handledBy,
        matched: "intent:upload_link",
      };
    }
    case "incident":
    case "cash_issue": {
      const esc = await escalateToHuman(
        ctx,
        text.slice(0, 500),
        intent === "cash_issue" ? "CASH_ISSUE" : "NEEDS_HUMAN",
      );
      return {
        replies: esc.replies,
        handledBy,
        matched: `intent:${intent}`,
        notifyOwner: esc.notifyOwner,
      };
    }
    default:
      return null;
  }
}
