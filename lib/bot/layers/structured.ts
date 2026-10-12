import type { TurnCtx } from "../context";
import { failStep, promptReplies, runCurrentStep } from "../engine";
import { enterStep, STEPS } from "../flow";
import type { Handled } from "../handled";
import { IDS, parseId } from "../ids";
import { startBookingFlow } from "../startFlow";
import { goBack } from "./commands";
import {
  handleExistingButton,
  handleTalkToHuman,
  showBooking,
} from "./existing";

/**
 * Interactive replies carry machine IDs (ids.ts) and are routed directly —
 * no text interpretation. Returns null for an id we don't recognise so the
 * caller can treat the button title as ordinary text.
 */
export async function handleButton(
  ctx: TurnCtx,
  rawId: string,
): Promise<Handled | null> {
  const id = parseId(rawId);
  if (!id) return null;
  const handledBy = "button" as const;
  const matched = `button:${id.raw}`;

  switch (id.kind) {
    case "menu":
      switch (id.raw) {
        case IDS.menu.viewCars:
          return {
            replies: await startBookingFlow(ctx, "fleet"),
            handledBy,
            matched,
          };
        case IDS.menu.checkAvailability:
          return {
            replies: await startBookingFlow(ctx, "availability"),
            handledBy,
            matched,
          };
        case IDS.menu.existingBooking:
          return { ...(await showBooking(ctx, matched)), handledBy };
        case IDS.menu.talkHuman:
          return handleTalkToHuman(
            ctx,
            "button",
            "Customer tapped “Talk to someone”",
          );
        default:
          return { replies: await enterStep(ctx, "MENU"), handledBy, matched };
      }

    case "nav":
      return goBack(ctx, matched, handledBy);

    case "faq":
      return {
        replies: [
          id.raw === IDS.faq.helpful ? ctx.t.faqThanks() : ctx.t.faqNoAnswer(),
        ],
        handledBy,
        matched,
      };

    case "req":
    case "bk": {
      const handled = await handleExistingButton(ctx, id);
      return handled ? { ...handled, handledBy } : null;
    }

    default: {
      // Step-specific ids (car:, loc:, date:, time:, confirm:, chg:, name:).
      const step = ctx.state.step;
      if (!STEPS[step].accepts.includes(id.kind)) {
        // A tap on an old message: don't act on it, just show where we are.
        return {
          replies: await promptReplies(ctx),
          handledBy,
          matched: `${matched}:stale`,
        };
      }
      const ran = await runCurrentStep(ctx, { kind: "button", id }, handledBy);
      if (!ran)
        return {
          replies: await promptReplies(ctx),
          handledBy,
          matched: `${matched}:stale`,
        };
      if ("handled" in ran) return { ...ran.handled, matched };
      return { ...(await failStep(ctx, ran.failed, handledBy)), matched };
    }
  }
}
