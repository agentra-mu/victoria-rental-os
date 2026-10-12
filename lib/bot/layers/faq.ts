import { containsPhrase, normalize, tokens } from "../text";
import type { TurnCtx } from "../context";
import { FLOW_STEPS, promptReplies } from "../engine";
import type { Handled } from "../handled";
import { matchFaqIntent } from "../lexicon";
import type { KbEntry } from "../ports";
import { textReply, type WhatsAppReply } from "@/lib/whatsapp/replies";

export const entryAnswer = (entry: KbEntry, lang: "en" | "fr") =>
  lang === "fr" && entry.answerFr ? entry.answerFr : entry.answer;

/** Keyword/intent rules: a built-in FAQ intent with a matching knowledge-base row, or a row's own keywords. */
export async function findByKeyword(
  ctx: TurnCtx,
  text: string,
): Promise<{ entry: KbEntry; via: string } | null> {
  const entries = await ctx.catalog.listKnowledge();
  const intent = matchFaqIntent(text);
  if (intent) {
    const entry = entries.find((e) => e.intentKey === intent);
    if (entry) return { entry, via: `intent:${intent}` };
  }
  const n = normalize(text);
  let best: { entry: KbEntry; len: number; kw: string } | null = null;
  for (const entry of entries) {
    for (const kw of entry.keywords) {
      const k = normalize(kw);
      if (k && containsPhrase(n, k) && (!best || k.length > best.len)) {
        best = { entry, len: k.length, kw };
      }
    }
  }
  return best ? { entry: best.entry, via: `keyword:${best.kw}` } : null;
}

/** Postgres FTS: reply only if the top hit clears the score threshold AND leads the runner-up by the margin. */
export async function findBySearch(
  ctx: TurnCtx,
  text: string,
): Promise<{ entry: KbEntry; score: number } | null> {
  if (tokens(text).length < 2) return null;
  const hits = await ctx.catalog.searchKnowledge(text, ctx.lang, 5);
  const [top, second] = hits;
  if (!top || top.score < ctx.cfg.faqMinScore) return null;
  if (second && top.score - second.score < ctx.cfg.faqMargin) return null;
  const entries = await ctx.catalog.listKnowledge();
  const entry = entries.find((e) => e.id === top.id);
  return entry ? { entry, score: top.score } : null;
}

/** Verbatim stored answer. Mid-booking it's followed by the current step's prompt so the flow resumes. */
export async function answerWith(
  ctx: TurnCtx,
  entry: KbEntry,
  matched: string,
): Promise<Handled> {
  const answer = entryAnswer(entry, ctx.lang);
  ctx.state.lastFaqEntryId = entry.id;
  ctx.parsed.faqEntry = entry.id;
  let replies: WhatsAppReply[];
  if (FLOW_STEPS.has(ctx.state.step)) {
    replies = [
      textReply(`${ctx.t.faqInline(answer)}\n\n${ctx.t.backToBooking()}`),
      ...(await promptReplies(ctx)),
    ];
  } else {
    replies = [ctx.t.faqAnswer(answer)];
  }
  return { replies, handledBy: "faq", matched };
}
