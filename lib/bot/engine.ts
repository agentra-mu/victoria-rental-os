import { textReply, type WhatsAppReply } from "@/lib/whatsapp/replies";
import { resetFlowState, type Outcome } from "./actions";
import type { TurnCtx } from "./context";
import { enterStep, STEPS, type StepInput, type StepParse } from "./flow";
import type { Handled } from "./handled";
import type { HandledBy, Step } from "./types";
import { escalateToHuman } from "./actions";

/** Steps where the customer is mid-booking (an FAQ answer is followed by the step's prompt). */
export const FLOW_STEPS: ReadonlySet<Step> = new Set([
  "CHOOSE_CAR",
  "PICKUP_DATETIME",
  "RETURN_DATETIME",
  "PICKUP_LOCATION",
  "DROPOFF_LOCATION",
  "FULL_NAME",
  "SUMMARY",
  "CHANGE_REQUEST_DETAILS",
]);

export const hasParser = (step: Step) => Boolean(STEPS[step].parse);

/** Applies a step's outcome: moves to the next step and appends its prompt unless the outcome said not to. */
export async function applyOutcome(
  ctx: TurnCtx,
  outcome: Outcome,
): Promise<WhatsAppReply[]> {
  const replies = [...outcome.replies];
  if (outcome.skipPrompt) {
    ctx.state.step = outcome.next;
    ctx.state.retries = 0;
    if (outcome.next === "MENU") resetFlowState(ctx);
  } else {
    replies.push(...(await enterStep(ctx, outcome.next)));
  }
  return replies;
}

/** Runs the current step's parser on `input`; on success runs onValid and moves on. */
export async function runCurrentStep(
  ctx: TurnCtx,
  input: StepInput,
  handledBy: HandledBy,
): Promise<
  { handled: Handled } | { failed: Extract<StepParse, { ok: false }> } | null
> {
  const handler = STEPS[ctx.state.step];
  if (!handler.parse || !handler.onValid) return null;
  const step = ctx.state.step;
  const result = await handler.parse(input, ctx);
  if (!result.ok) return { failed: result };
  const outcome = await (
    handler.onValid as (v: unknown, c: TurnCtx) => Promise<Outcome>
  )(result.value, ctx);
  const replies = await applyOutcome(ctx, outcome);
  return {
    handled: { replies, handledBy, matched: `step:${step}` },
  };
}

/**
 * A step parse failed: re-prompt with the specific template (max
 * `maxReprompts` times), then show the stuck buttons, then hand to a human.
 */
export async function failStep(
  ctx: TurnCtx,
  failure: Extract<StepParse, { ok: false }>,
  handledBy: HandledBy,
): Promise<Handled> {
  const step = ctx.state.step;
  ctx.parsed.failure = failure.reason;
  if (failure.noRetry) {
    return {
      replies: failure.replies,
      handledBy,
      matched: `step:${step}:clarify`,
    };
  }
  ctx.state.retries += 1;
  const n = ctx.state.retries;
  if (n <= ctx.cfg.maxReprompts) {
    return {
      replies: failure.replies,
      handledBy,
      matched: `step:${step}:reprompt${n}`,
    };
  }
  if (n === ctx.cfg.maxReprompts + 1) {
    return {
      replies: [ctx.t.stuck()],
      handledBy,
      matched: `step:${step}:stuck`,
      unrecognised: true,
    };
  }
  const esc = await escalateToHuman(
    ctx,
    `Customer got stuck at step ${step} (${failure.reason})`,
  );
  return {
    replies: esc.replies,
    handledBy,
    matched: `step:${step}:escalated`,
    unrecognised: true,
    notifyOwner: esc.notifyOwner,
  };
}

export const promptReplies = async (ctx: TurnCtx): Promise<WhatsAppReply[]> =>
  STEPS[ctx.state.step].prompt(ctx);

export { textReply };
