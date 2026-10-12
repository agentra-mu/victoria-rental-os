import { classifyAndExtract, type ClassifyResult } from "@/lib/llm/tasks";
import { textReply, type WhatsAppReply } from "@/lib/whatsapp/replies";
import { escalateToHuman } from "../actions";
import type { TurnCtx } from "../context";
import { applyOutcome, runCurrentStep } from "../engine";
import type { StepInput } from "../flow";
import type { Handled } from "../handled";
import { INTENT_KEYS } from "../lexicon";
import { dateLabel, timeLabel } from "../parsers/localTime";
import { startBookingFlow } from "../startFlow";
import type { Step } from "../types";
import { routeIntent } from "./intents";

const MIN_CONFIDENCE = 0.6;

/** Failures that mean "I understood you but that's not valid" — a model can't help with those. */
const NOT_UNDERSTANDABLE = new Set([
  "PAST_DATE",
  "NOT_LATER",
  "STALE",
  "TEXT_AT_SUMMARY",
  "AWAITING_CONFIRMATION",
  "NO_REASON",
  "AMBIGUOUS",
  "AMBIGUOUS_DATE",
  "AMBIGUOUS_TIME",
]);
export const isUnderstandable = (reason: string) =>
  !NOT_UNDERSTANDABLE.has(reason);

type Extracted = ClassifyResult["extracted"];

/** What each step would like to be given, taken from the model's labelled phrases. */
function candidateFor(step: Step, e: Extracted): string | undefined {
  switch (step) {
    case "CHOOSE_CAR":
      return e.car;
    case "PICKUP_DATETIME":
      return e.pickup_datetime ?? e.dates?.[0];
    case "RETURN_DATETIME":
      return e.return_datetime ?? e.duration ?? e.dates?.[1];
    case "PICKUP_LOCATION":
      return e.pickup_location ?? e.location;
    case "DROPOFF_LOCATION":
      return e.dropoff_location;
    case "FULL_NAME":
      return e.name;
    default:
      return undefined;
  }
}

/** Human-readable echo of the slot a step just accepted. */
function acceptedLabel(ctx: TurnCtx, step: Step): string | null {
  const p = ctx.state.pending;
  const p_ = ctx.parsed;
  switch (step) {
    case "CHOOSE_CAR":
      return typeof p_.car === "string" ? p_.car : null;
    case "PICKUP_DATETIME":
      return p.pickupDate
        ? `pickup ${dateLabel(p.pickupDate, ctx.lang)}${p.pickupTime ? ` ${timeLabel(p.pickupTime, ctx.lang)}` : ""}`
        : null;
    case "RETURN_DATETIME":
      return p.returnDate
        ? `return ${dateLabel(p.returnDate, ctx.lang)}${p.returnTime ? ` ${timeLabel(p.returnTime, ctx.lang)}` : ""}`
        : null;
    case "PICKUP_LOCATION":
    case "DROPOFF_LOCATION":
      return typeof p_.location === "string" ? p_.location : null;
    case "FULL_NAME":
      return typeof p_.name === "string" ? p_.name : null;
    default:
      return null;
  }
}

/**
 * Feeds the model's labelled phrases, one per step, through the SAME step
 * parsers the customer's own typing would hit (fuzzy car match, date parser,
 * location aliases, name rules). Stops at the first phrase a parser rejects
 * or the first step with nothing to give; the bot then simply asks for that.
 * The model's own wording is never sent to the customer.
 */
async function fillSlots(
  ctx: TurnCtx,
  extracted: Extracted,
): Promise<{ replies: WhatsAppReply[]; accepted: string[] } | null> {
  const used = new Set<Step>();
  const accepted: string[] = [];
  let last: WhatsAppReply[] | null = null;
  for (let i = 0; i < 6; i++) {
    const step = ctx.state.step;
    if (used.has(step)) break;
    const candidate = candidateFor(step, extracted);
    if (!candidate) break;
    used.add(step);
    const input: StepInput = { kind: "text", text: candidate };
    const ran = await runCurrentStep(ctx, input, "llm_fallback");
    if (!ran || !("handled" in ran)) break;
    last = ran.handled.replies;
    const label = acceptedLabel(ctx, step);
    if (label) accepted.push(label);
  }
  return last ? { replies: last, accepted } : null;
}

/**
 * Starts the booking flow where the first detail belongs (unless the customer is already in it), then
 * pushes each extracted detail through its step's parser. Shared by the model path and the rules path.
 */
export async function startAndFill(
  ctx: TurnCtx,
  extracted: Extracted,
  intent: string,
  handledBy: Handled["handledBy"],
  tag: string,
): Promise<Handled | null> {
  const inFlow = ![
    "MENU",
    "DONE",
    "AWAITING_DOCUMENTS",
    "EXISTING_BOOKING_MENU",
  ].includes(ctx.state.step);
  let opening: WhatsAppReply[] = [];
  if (!inFlow) {
    const wantsAvailability =
      intent === "check_availability" ||
      (!extracted.car &&
        Boolean(extracted.pickup_datetime || extracted.dates?.length));
    opening = await startBookingFlow(
      ctx,
      wantsAvailability ? "availability" : "fleet",
    );
  }
  const filled = await fillSlots(ctx, extracted);
  if (filled) {
    ctx.state.unknownStreak = 0;
    const replies =
      filled.accepted.length > 0
        ? [ctx.t.gotIt(filled.accepted), ...filled.replies]
        : filled.replies;
    return { replies, handledBy, matched: `${tag}:slots` };
  }
  if (!inFlow) {
    ctx.state.unknownStreak = 0;
    return { replies: opening, handledBy, matched: `${tag}:${intent}` };
  }
  return null;
}

export const hasBookingSlots = (e: Extracted) =>
  Boolean(
    e.car ||
    e.pickup_datetime ||
    e.return_datetime ||
    e.duration ||
    e.pickup_location ||
    e.dropoff_location ||
    e.name ||
    e.dates?.length,
  );

/**
 * "Understand everything" layer. Reads a free-text message with the model
 * (when enabled), then acts on it ONLY through the deterministic machinery:
 * an intent is routed exactly like a button would be, and extracted phrases go
 * through the step parsers. Returns null when the model is unavailable, unsure
 * or finds nothing actionable — callers fall back to the rules' own handling.
 */
export async function understand(
  ctx: TurnCtx,
  text: string,
): Promise<Handled | null> {
  const llm = ctx.llm;
  if (!llm?.enabled) return null;

  const out = await classifyAndExtract(llm, text, {
    step: ctx.state.step,
    lexiconHints: INTENT_KEYS.slice(),
  });
  if (!out.ok) {
    ctx.parsed.llmReason = out.reason;
    return null;
  }
  const r = out.value;
  ctx.parsed.llmIntent = r.intent;
  ctx.parsed.llmConfidence = r.confidence;
  if (r.confidence < MIN_CONFIDENCE) {
    ctx.parsed.llmReason = "low_confidence";
    return null;
  }
  if (r.language !== ctx.lang) ctx.setLang(r.language);

  if (r.intent === "talk_human") {
    const esc = await escalateToHuman(ctx, text);
    return {
      replies: esc.replies,
      handledBy: "llm_fallback",
      matched: "llm:talk_human",
      notifyOwner: esc.notifyOwner,
    };
  }
  if (r.intent === "menu") {
    return {
      replies: await applyOutcome(ctx, { replies: [], next: "MENU" }),
      handledBy: "llm_fallback",
      matched: "llm:menu",
    };
  }

  const bookingish =
    hasBookingSlots(r.extracted) ||
    r.intent === "view_cars" ||
    r.intent === "check_availability";
  if (bookingish) {
    const started = await startAndFill(
      ctx,
      r.extracted,
      r.intent,
      "llm_fallback",
      "llm",
    );
    if (started) return started;
    ctx.parsed.llmReason = "no_usable_slots";
    return null;
  }

  if (r.intent === "unknown") {
    ctx.parsed.llmReason = "unknown";
    return null;
  }
  const routed = await routeIntent(ctx, r.intent, text, "llm_fallback");
  if (routed) {
    ctx.state.unknownStreak = 0;
    return { ...routed, matched: `llm:${routed.matched}` };
  }
  ctx.parsed.llmReason = "unroutable";
  return null;
}

export { textReply };
