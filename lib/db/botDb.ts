import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BotCatalog,
  ChangeRequestPort,
  KbEntry,
  TurnLogPort,
} from "@/lib/bot/ports";
import { createChangeRequest } from "@/lib/domain/changeRequestsDb";
import type { LlmLogPort } from "@/lib/llm/guard";

/** Reference data the bot caches: knowledge base (with keywords/intents/French) and location aliases, plus FTS. */
export function createSupabaseCatalog(client: SupabaseClient): BotCatalog {
  return {
    async listKnowledge() {
      const { data, error } = await client
        .from("knowledge_base")
        .select(
          "id, topic, question, answer, question_fr, answer_fr, keywords, intent_key",
        )
        .eq("active", true);
      if (error) throw error;
      return (data ?? []).map((r): KbEntry => ({
        id: r.id,
        topic: r.topic,
        question: r.question,
        answer: r.answer,
        questionFr: r.question_fr ?? null,
        answerFr: r.answer_fr ?? null,
        keywords: r.keywords ?? [],
        intentKey: r.intent_key ?? null,
      }));
    },

    async searchKnowledge(query, lang, limit) {
      const { data, error } = await client.rpc("search_knowledge", {
        q: query,
        lang,
        lim: limit,
      });
      if (error) throw error;
      return ((data ?? []) as { id: string; score: number }[]).map((r) => ({
        id: r.id,
        score: Number(r.score),
      }));
    },

    async listLocationAliases() {
      const { data, error } = await client
        .from("locations")
        .select("id, aliases")
        .eq("active", true);
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((r) => [
          r.id as string,
          (r.aliases as string[] | null) ?? [],
        ]),
      );
    },
  };
}

export function createSupabaseLlmLog(client: SupabaseClient): LlmLogPort {
  return {
    async record(row) {
      const { error } = await client.from("llm_calls").insert({
        conversation_id: row.conversationId,
        customer_id: row.customerId,
        message_id: row.messageId ?? null,
        purpose: row.purpose,
        provider: row.provider,
        model: row.model,
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
        latency_ms: row.latencyMs,
      });
      if (error) throw error;
    },
    async countSince(scope, since) {
      let q = client
        .from("llm_calls")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since.toISOString());
      if (scope.conversationId)
        q = q.eq("conversation_id", scope.conversationId);
      if (scope.customerId) q = q.eq("customer_id", scope.customerId);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  };
}

export function createSupabaseTurnLog(client: SupabaseClient): TurnLogPort {
  return {
    async record(row) {
      const { error } = await client.from("bot_turns").insert({
        conversation_id: row.conversationId,
        customer_id: row.customerId,
        message_id: row.messageId,
        layer: row.layer,
        matched: row.matched,
        step: row.step,
        next_step: row.nextStep,
        total_ms: row.totalMs,
        db_ms: row.dbMs,
        llm_ms: row.llmMs,
        llm_calls: row.llmCalls,
        unrecognised: row.unrecognised,
        inbound_text: row.inboundText,
        parsed: row.parsed,
        booking_id: row.bookingId,
        booking_confirmed: row.bookingConfirmed,
      });
      if (error) throw error;
    },
  };
}

/** Files a change request + owner notification via the domain layer. The booking itself is never touched. */
export function createChangeRequestPort(
  client: SupabaseClient,
): ChangeRequestPort {
  return async (bookingId, type, details) => {
    const result = await createChangeRequest(client, bookingId, type, details);
    return {
      quotedAdditionalRs: result.quotedAdditionalRs,
      availabilityOk: result.availabilityOk,
    };
  };
}
