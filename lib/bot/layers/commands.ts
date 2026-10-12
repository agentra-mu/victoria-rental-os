import { cancelOwnDraft, resetFlowState } from "../actions";
import type { TurnCtx } from "../context";
import {
  applyOutcome,
  FLOW_STEPS,
  promptReplies,
  runCurrentStep,
} from "../engine";
import { enterStep, previousStep } from "../flow";
import type { Handled } from "../handled";
import { IDS, parseId } from "../ids";
import { matchCommand } from "../lexicon";
import { showBooking, handleTalkToHuman } from "./existing";
import type { Step } from "../types";

/** Re-asks the step the customer is on after a wipe (BACK from a date step clears what came after). */
export async function goBack(
  ctx: TurnCtx,
  matched: string,
  handledBy: "button" | "command",
): Promise<Handled> {
  const from = ctx.state.step;
  const target = previousStep(ctx);
  if (target === "PICKUP_DATETIME") ctx.state.pending = {};
  if (target === "RETURN_DATETIME") {
    ctx.state.pending.returnDate = undefined;
    ctx.state.pending.returnTime = undefined;
  }
  if (from === "CHOOSE_CAR" || target === "CHOOSE_CAR")
    ctx.state.returnToSummary = undefined;
  const replies = await enterStep(ctx, target);
  return { replies, handledBy, matched: `${matched}:${from}->${target}` };
}

const CONFIRM_STEPS: ReadonlySet<Step> = new Set([
  "SUMMARY",
  "CHANGE_REQUEST_DETAILS",
]);

/**
 * Global commands (HUMAN, MENU, CANCEL, STOP, BACK/CHANGE, YES/NO, thanks,
 * greetings), matched on lexicon.ts keywords in English and French.
 */
export async function handleCommand(
  ctx: TurnCtx,
  text: string,
): Promise<Handled | null> {
  const cmd = matchCommand(text);
  if (!cmd) return null;
  const handledBy = "command" as const;
  const matched = `command:${cmd.name}`;
  const step = ctx.state.step;

  switch (cmd.name) {
    case "human":
      return handleTalkToHuman(ctx, "command", text);

    case "stop":
    case "start": {
      const optedOut = cmd.name === "stop";
      await ctx.messaging.setCustomerOptOut(ctx.customer.id, optedOut);
      return {
        replies: [optedOut ? ctx.t.optedOut() : ctx.t.optedIn()],
        handledBy,
        matched,
      };
    }

    case "menu": {
      resetFlowState(ctx);
      return { replies: await enterStep(ctx, "MENU"), handledBy, matched };
    }

    case "greeting": {
      if (FLOW_STEPS.has(step))
        return {
          replies: await promptReplies(ctx),
          handledBy,
          matched: `${matched}:resume`,
        };
      return { replies: await enterStep(ctx, "MENU"), handledBy, matched };
    }

    case "thanks":
      return { replies: [ctx.t.faqThanks()], handledBy, matched };

    case "back":
      return goBack(ctx, matched, handledBy);

    case "change": {
      if (step === "SUMMARY") {
        const r = await runCurrentStep(
          ctx,
          { kind: "button", id: parseId(IDS.confirm.change)! },
          handledBy,
        );
        if (r && "handled" in r) return r.handled;
      }
      return goBack(ctx, matched, handledBy);
    }

    case "cancel": {
      if (step === "CHANGE_REQUEST_DETAILS") {
        ctx.state.change = undefined;
        return {
          replies: await enterStep(ctx, "DONE"),
          handledBy,
          matched: `${matched}:change_request`,
        };
      }
      if (FLOW_STEPS.has(step) || ctx.state.draftBookingId) {
        const cancelled = await cancelOwnDraft(ctx);
        resetFlowState(ctx);
        ctx.state.step = "MENU";
        return {
          replies: [
            cancelled ? ctx.t.draftCancelled() : ctx.t.nothingToCancel(),
          ],
          handledBy,
          matched: `${matched}:draft`,
        };
      }
      // A confirmed booking: open a cancellation *request* (the team decides).
      const shown = await showBooking(ctx, matched, "CANCELLATION");
      return { ...shown, handledBy };
    }

    case "yes":
    case "no": {
      if (CONFIRM_STEPS.has(step)) {
        const id =
          step === "SUMMARY"
            ? cmd.name === "yes"
              ? IDS.confirm.yes
              : IDS.confirm.change
            : cmd.name === "yes"
              ? IDS.confirm.yes
              : IDS.confirm.cancel;
        if (
          step === "CHANGE_REQUEST_DETAILS" &&
          ctx.state.change?.stage !== "confirm" &&
          ctx.state.change?.type !== "CANCELLATION"
        ) {
          return null; // a bare yes/no isn't a date or delay
        }
        const r = await runCurrentStep(
          ctx,
          { kind: "button", id: parseId(id)! },
          handledBy,
        );
        if (r && "handled" in r)
          return { ...r.handled, matched: `${matched}:${r.handled.matched}` };
      }
      // Outside a confirmation a bare yes/no has no meaning: show the menu.
      return {
        replies: await applyOutcome(ctx, { replies: [], next: "MENU" }),
        handledBy,
        matched: `${matched}:menu`,
      };
    }
  }
}
