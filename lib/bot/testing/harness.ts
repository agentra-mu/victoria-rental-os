import { createFakeDb } from "@/lib/domain/testing/fakeDb";
import { createMockProvider, type MockProvider } from "@/lib/llm/adapters/mock";
import {
  createLlmGateway,
  type LlmLogPort,
  type LlmLogRow,
} from "@/lib/llm/guard";
import { noneProvider } from "@/lib/llm/adapters/none";
import type { WhatsAppReply } from "@/lib/whatsapp/replies";
import { replyBodyText } from "@/lib/whatsapp/replies";
import { createFakeMessagingDb } from "@/lib/whatsapp/testing/fakeMessagingDb";
import { loadBotConfig } from "../config";
import { handleTurn } from "../handleTurn";
import { normalize, tokens } from "../text";
import type { BotCatalog, BotDeps, TurnLogRow } from "../ports";
import { readState, type TurnResult } from "../types";
import { ALIASES, KB, fixtureSeed } from "./fixtures";

/** Mon 12 Oct 2026, 08:00 in Mauritius. */
export const TEST_NOW = new Date("2026-10-12T04:00:00Z");

export function createMemoryCatalog(): BotCatalog {
  return {
    async listKnowledge() {
      return KB;
    },
    async searchKnowledge(query, _lang, limit) {
      const q = new Set(tokens(query).filter((t) => t.length > 2));
      return KB.map((e) => {
        const words = new Set(tokens(`${e.question} ${e.answer}`));
        const hits = [...q].filter((t) => words.has(t)).length;
        return { id: e.id, score: q.size === 0 ? 0 : hits / q.size };
      })
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
    async listLocationAliases() {
      return ALIASES;
    },
  };
}

export function createMemoryLlmLog(): LlmLogPort & { rows: LlmLogRow[] } {
  const rows: LlmLogRow[] = [];
  return {
    rows,
    async record(row) {
      rows.push(row);
    },
    async countSince(scope) {
      return rows.filter(
        (r) =>
          (scope.conversationId
            ? r.conversationId === scope.conversationId
            : true) &&
          (scope.customerId ? r.customerId === scope.customerId : true),
      ).length;
    },
  };
}

export interface HarnessOptions {
  /** "disabled" (default) = no LLM; "forbidden" = enabled but any call fails the test; "mock" = scripted. */
  llm?: "disabled" | "forbidden" | "mock";
  now?: Date;
  whatsappNumber?: string;
  seed?: Parameters<typeof createFakeDb>[0];
  gateway?: {
    perConversationPerDay?: number;
    perCustomerPerDay?: number;
    timeoutMs?: number;
  };
}

/** A whole bot over in-memory fakes: send customer messages, inspect replies, layers, state and DB. */
export async function createBotHarness(options: HarnessOptions = {}) {
  const fakeDb = createFakeDb(options.seed ?? fixtureSeed());
  const fakeMessaging = createFakeMessagingDb();
  const mode = options.llm ?? "disabled";
  const provider: MockProvider | null =
    mode === "disabled"
      ? null
      : createMockProvider({ failOnCall: mode === "forbidden" });
  const llmLog = createMemoryLlmLog();
  const turnLogs: TurnLogRow[] = [];
  const changeRequests: { bookingId: string; type: string; details: object }[] =
    [];
  let now = options.now ?? TEST_NOW;

  const gateway = provider
    ? createLlmGateway({
        provider,
        log: llmLog,
        now: () => now,
        config: {
          perConversationPerDay: options.gateway?.perConversationPerDay ?? 6,
          perCustomerPerDay: options.gateway?.perCustomerPerDay ?? 15,
          maxInputChars: 1500,
          timeoutMs: options.gateway?.timeoutMs ?? 4000,
          cacheTtlMs: 86_400_000,
        },
      })
    : createLlmGateway({ provider: noneProvider, log: llmLog, now: () => now });

  const deps: BotDeps = {
    domainDb: fakeDb.db,
    messaging: fakeMessaging.db,
    catalog: createMemoryCatalog(),
    requestChange: async (bookingId, type, details) => {
      changeRequests.push({ bookingId, type, details });
      return {
        quotedAdditionalRs: type === "EXTENSION" ? 2400 : 0,
        availabilityOk: true,
      };
    },
    llm: provider ? gateway : null,
    turnLog: { record: async (row) => void turnLogs.push(row) },
    appUrl: () => "https://app.example.com",
    now: () => now,
    config: loadBotConfig(),
  };

  const number = options.whatsappNumber ?? "+23057000001";
  const { customer, conversation } =
    await fakeMessaging.db.loadCustomerAndConversation(number);
  let counter = 0;

  async function send(
    input: string | { replyId: string } | { type: "image" },
  ): Promise<TurnResult> {
    const messageId = `wamid-${++counter}`;
    const message =
      typeof input === "string"
        ? { messageId, type: "text" as const, text: input }
        : "replyId" in input
          ? { messageId, type: "button_reply" as const, replyId: input.replyId }
          : { messageId, type: "image" as const };
    return handleTurn(deps, conversation.id, message, {
      customer,
      conversation,
    });
  }

  return {
    send,
    deps,
    fakeDb,
    fakeMessaging,
    customer,
    conversation,
    provider,
    llmLog,
    turnLogs,
    changeRequests,
    setNow: (d: Date) => void (now = d),
    state: () => readState(conversation.state),
    bookings: () =>
      Array.from(fakeDb.bookings.values()).filter(
        (b) => b.customerId === customer.id,
      ),
    /** Total LLM calls the provider received (0 when disabled). */
    llmCalls: () => provider?.calls.length ?? 0,
  };
}

export type Harness = Awaited<ReturnType<typeof createBotHarness>>;

export const textOf = (replies: WhatsAppReply[]): string =>
  replies.map((r) => replyBodyText(r)).join("\n");

/** Every button / list-row id in the replies. */
export function idsOf(replies: WhatsAppReply[]): string[] {
  return replies.flatMap((r) =>
    r.type === "buttons"
      ? r.interactive.action.buttons.map((b) => b.reply.id)
      : r.type === "list"
        ? r.interactive.action.sections[0].rows.map((row) => row.id)
        : [],
  );
}

export { normalize };
