/** Chatbot health metrics over bot_turns / llm_calls rows — pure, unit-tested. */

export interface TurnRow {
  conversation_id: string | null;
  layer: string;
  total_ms: number;
  llm_calls: number;
  unrecognised: boolean;
  inbound_text: string | null;
  booking_confirmed: boolean;
  created_at: string;
}

export interface LlmCallRow {
  purpose: string;
  created_at: string;
  latency_ms: number;
}

export interface BotMetrics {
  turns: number;
  /** % of turns answered with no LLM call at all (null when there are no turns). */
  pctWithoutLlm: number | null;
  /** % of bookings confirmed in a conversation whose booking turns made no LLM call. */
  pctBookingsWithoutLlm: number | null;
  bookingsConfirmed: number;
  avgTurnMs: number | null;
  p95TurnMs: number | null;
  byLayer: { layer: string; turns: number }[];
  /** Turns that reached the optional LLM fallback and called a model, per day (YYYY-MM-DD, UTC). */
  fallbackPerDay: { day: string; calls: number }[];
  unrecognised: number;
  topUnrecognised: { phrase: string; count: number }[];
}

const normalisePhrase = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ];
}

/**
 * "A booking completed with zero LLM calls": for each booking-confirming turn,
 * look at that conversation's turns since its previous confirmation — if none
 * of them called a model, the whole booking was rule-driven.
 */
export function computeBotMetrics(
  turns: TurnRow[],
  llmCalls: LlmCallRow[],
): BotMetrics {
  const sorted = [...turns].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const total = sorted.length;
  const withoutLlm = sorted.filter((t) => t.llm_calls === 0).length;

  const lastConfirm = new Map<string, number>(); // conversation → index after previous confirmation
  let confirmed = 0;
  let confirmedWithoutLlm = 0;
  sorted.forEach((t, i) => {
    if (!t.booking_confirmed || !t.conversation_id) return;
    const from = lastConfirm.get(t.conversation_id) ?? 0;
    const flow = sorted
      .slice(from, i + 1)
      .filter((x) => x.conversation_id === t.conversation_id);
    confirmed += 1;
    if (flow.every((x) => x.llm_calls === 0)) confirmedWithoutLlm += 1;
    lastConfirm.set(t.conversation_id, i + 1);
  });

  const ms = sorted.map((t) => t.total_ms).sort((a, b) => a - b);
  const layers = new Map<string, number>();
  for (const t of sorted) layers.set(t.layer, (layers.get(t.layer) ?? 0) + 1);

  const perDay = new Map<string, number>();
  for (const c of llmCalls) {
    const day = c.created_at.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  const phrases = new Map<string, number>();
  for (const t of sorted) {
    if (!t.unrecognised || !t.inbound_text) continue;
    const key = normalisePhrase(t.inbound_text);
    if (key) phrases.set(key, (phrases.get(key) ?? 0) + 1);
  }

  return {
    turns: total,
    pctWithoutLlm: total ? Math.round((withoutLlm / total) * 1000) / 10 : null,
    pctBookingsWithoutLlm: confirmed
      ? Math.round((confirmedWithoutLlm / confirmed) * 1000) / 10
      : null,
    bookingsConfirmed: confirmed,
    avgTurnMs: total ? Math.round(ms.reduce((a, b) => a + b, 0) / total) : null,
    p95TurnMs: percentile(ms, 95),
    byLayer: [...layers]
      .map(([layer, n]) => ({ layer, turns: n }))
      .sort((a, b) => b.turns - a.turns),
    fallbackPerDay: [...perDay]
      .map(([day, calls]) => ({ day, calls }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    unrecognised: sorted.filter((t) => t.unrecognised).length,
    topUnrecognised: [...phrases]
      .map(([phrase, count]) => ({ phrase, count }))
      .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase))
      .slice(0, 15),
  };
}
