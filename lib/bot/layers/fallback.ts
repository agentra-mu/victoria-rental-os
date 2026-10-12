import { answerFromKnowledge, validateGroundedAnswer } from "@/lib/llm/tasks";
import { escalateToHuman } from "../actions";
import type { TurnCtx } from "../context";
import type { Handled } from "../handled";
import { looksLikeQuestion } from "../lexicon";
import { entryAnswer } from "./faq";
import { hasSlotSignals } from "../signals";
import { understand } from "./understand";

const MIN_CONFIDENCE = 0.6;

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

  if (looksLikeQuestion(text) && !(await hasSlotSignals(ctx, text))) {
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

  const understood = await understand(ctx, text);
  if (understood) return understood;
  return unknownReply(ctx, `llm:${ctx.parsed.llmReason ?? "unknown"}`);
}
