import type { DomainDb } from "@/lib/domain/ports";
import type { LlmGateway } from "@/lib/llm/guard";
import type { MessagingDb } from "@/lib/whatsapp/ports";
import type { BotConfig } from "./config";
import type { HandledBy, Lang, Step } from "./types";

/** A knowledge_base row as the bot sees it (with the keyword/intent/French columns). */
export interface KbEntry {
  id: string;
  topic: string;
  question: string;
  answer: string;
  questionFr: string | null;
  answerFr: string | null;
  keywords: string[];
  intentKey: string | null;
}

export interface KbHit {
  id: string;
  /** Normalised 0..1 relevance. */
  score: number;
}

/** Rarely-changing reference data the bot caches (knowledge base, location aliases) plus FTS. */
export interface BotCatalog {
  listKnowledge(): Promise<KbEntry[]>;
  searchKnowledge(query: string, lang: Lang, limit: number): Promise<KbHit[]>;
  /** locationId → aliases ("airport", "SSR", "grand bay"). */
  listLocationAliases(): Promise<Record<string, string[]>>;
}

export interface TurnLogRow {
  conversationId: string;
  customerId: string;
  messageId: string | null;
  layer: HandledBy;
  matched: string | null;
  step: Step;
  nextStep: Step;
  totalMs: number;
  dbMs: number;
  llmMs: number;
  llmCalls: number;
  unrecognised: boolean;
  inboundText: string | null;
  parsed: Record<string, unknown> | null;
  bookingId: string | null;
  bookingConfirmed: boolean;
}

export interface TurnLogPort {
  record(row: TurnLogRow): Promise<void>;
}

/** Files a change request for the owner. Never changes the booking itself. */
export interface ChangeRequestPort {
  (
    bookingId: string,
    type: "RETURN_DELAY" | "EXTENSION" | "PICKUP_TIME_CHANGE" | "CANCELLATION",
    details: { newReturnAt?: string; newPickupAt?: string; note?: string },
  ): Promise<{ quotedAdditionalRs: number; availabilityOk: boolean }>;
}

export interface BotDeps {
  domainDb: DomainDb;
  messaging: MessagingDb;
  catalog: BotCatalog;
  requestChange: ChangeRequestPort;
  /** Null (or a gateway whose provider is "none") means LLM_ENABLED=false. */
  llm: LlmGateway | null;
  turnLog?: TurnLogPort;
  appUrl: () => string;
  now?: () => Date;
  config?: BotConfig;
}
