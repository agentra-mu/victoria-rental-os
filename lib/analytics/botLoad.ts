import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { LlmCallRow, TurnRow } from "./botMetrics";
import type { Period } from "./metrics";

export async function loadBotAnalyticsInput(
  period: Period,
): Promise<{ turns: TurnRow[]; llmCalls: LlmCallRow[] }> {
  const db = getServiceSupabase();
  const from = period.start.toISOString();
  const to = period.end.toISOString();
  const [turns, calls] = await Promise.all([
    db
      .from("bot_turns")
      .select(
        "conversation_id, layer, total_ms, llm_calls, unrecognised, inbound_text, booking_confirmed, created_at",
      )
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at")
      .limit(20000),
    db
      .from("llm_calls")
      .select("purpose, created_at, latency_ms")
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(20000),
  ]);
  return {
    turns: (turns.data ?? []) as TurnRow[],
    llmCalls: (calls.data ?? []) as LlmCallRow[],
  };
}
