import {
  classifyAndExtract,
  answerFromKnowledge,
  validateGroundedAnswer,
} from "@/lib/llm/tasks";
import { escalateToHuman } from "../actions";
import type { TurnCtx } from "../context";
import { applyOutcome, runCurrentStep } from "../engine";
import type { Handled } from "../handled";
import { INTENT_KEYS, looksLikeQuestion } from "../lexicon";
import type { Step } from "../types";
import type { WhatsAppReply } from "@/lib/whatsapp/replies";
import type { StepInput } from "../flow";
import { entryAnswer } from "./faq";
import { routeIntent } from "./intents";

const MIN_CONFIDENCE = 0.6;

/**
 * Values the model pulled out of the message go through the SAME step
 * parsers the customer's own typing would (fuzzy car match, date parser,
 * location aliases, name rules). The model's wording is never trusted or sent.
 * Returns the replies of the last step that accepted a value, or null.
 */
async function feedExtracted(
  ctx: TurnCtx,
  extracted: {
    dates?: string[];
    car?: string;
    location?: string;
    name?: string;
  },
): Promise<WhatsAppReply[] | null> {
  const queue: Partial<Record<Step, string | undefined>> = {
    CHOOSE_CAR: extracted.car,
    PICKUP_DATETIME: extracted.dates?.[0],
    RETURN_DATETIME: extracted.dates?.[1],
    PICKUP_LOCATION: extracted.location,
    FULL_NAME: extracted.name,
  };
  let last: WhatsAppReply[] | null = null;
  for (let i = 0; i < 4; i++) {
    const candidate = queue[ctx.state.step];
    if (!candidate) break;
    queue[ctx.state.step] = undefined;
    const input: StepInput = { kind: "text", text: candidate };
    const ran = await runCurrentStep(ctx, input, "llm_fallback");
    if (!ran || !("handled" in ran)) break;
    last = ran.handled.replies;
  }
  return last;
}

/** "Sorry, I didn't understand" + menu buttons; two in a row (configurable) hands the chat to a person. */
export async function unknownReply(
  ctx: TurnCtx,
  matched: string,
): Promise<Handled> {
  ctx.state.unknownStreak += 1;
  if (ctx.state.unknownStreak >= ctx.cfg.unknownStreakLimit) {
    const esc = await escalateToHuman(
      ctx,
      `The bot could not understand the customer ${ctx.state.unknownStreak} times in a row.`,
    );
    return {
      replies: esc.replies,
      handledBy: "llm_fallback",
      matched: `${matched}:escalated`,
      unrecognised: true,
      notifyOwner: esc.notifyOwner,
    };
  }
  return {
    replies: [ctx.t.unknown()],
    handledBy: "llm_fallback",
    matched,
    unrecognised: true,
  };
}

/**
 * Last resort for free text nothing else handled. Needs LLM_ENABLED=true;
 * otherwise (or on cap / timeout / invalid output) it degrades to the menu.
 * The model never writes customer text except a grounded knowledge answer,
 * and every extracted value is re-checked by the same deterministic parsers.
 */
export async function llmFallback(
  ctx: TurnCtx,
  text: string,
): Promise<Handled> {
  const llm = ctx.llm;
  if (!llm || !llm.enabled) return unknownReply(ctx, "fallback:disabled");

  if (looksLikeQuestion(text)) {
    const hits = await ctx.catalog.searchKnowledge(text, ctx.lang, 5);
    const all = await ctx.catalog.listKnowledge();
    const offered = hits
      .map((h) => all.find((e) => e.id === h.id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
      .map((e) => ({
        id: e.id,
        question: ctx.lang === "fr" && e.questionFr ? e.questionFr : e.question,
        answer: entryAnswer(e, ctx.lang),
      }));
    if (offered.length > 0) {
      const out = await answerFromKnowledge(llm, text, offered, ctx.lang);
      if (out.ok) {
        const valid = validateGroundedAnswer(
          out.value,
          offered,
          MIN_CONFIDENCE,
        );
        if (valid.ok) {
          ctx.state.unknownStreak = 0;
          ctx.parsed.llmKbEntries = valid.usedIds;
          return {
            replies: [ctx.t.faqAnswer(valid.answer)],
            handledBy: "llm_fallback",
            matched: "llm:kb_answer",
            generatedBy: "llm",
          };
        }
      }
      return unknownReply(ctx, "llm:kb_rejected");
    }
  }

  const out = await classifyAndExtract(llm, text, {
    step: ctx.state.step,
    lexiconHints: INTENT_KEYS.slice(),
  });
  if (!out.ok) return unknownReply(ctx, `llm:${out.reason}`);
  const r = out.value;
  ctx.parsed.llmIntent = r.intent;
  ctx.parsed.llmConfidence = r.confidence;
  if (r.confidence < MIN_CONFIDENCE)
    return unknownReply(ctx, "llm:low_confidence");

  if (r.intent === "unknown") return unknownReply(ctx, "llm:unknown");
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
    ctx.state.unknownStreak = 0;
    return {
      replies: await applyOutcome(ctx, { replies: [], next: "MENU" }),
      handledBy: "llm_fallback",
      matched: "llm:menu",
    };
  }
  const routed = await routeIntent(ctx, r.intent, text, "llm_fallback");
  if (routed) {
    ctx.state.unknownStreak = 0;
    const chained = await feedExtracted(ctx, r.extracted);
    return {
      ...routed,
      replies: chained ?? routed.replies,
      matched: `llm:${routed.matched}${chained ? "+extracted" : ""}`,
    };
  }
  return unknownReply(ctx, "llm:unroutable");
}
