import type Anthropic from "@anthropic-ai/sdk";
import type { DomainDb } from "@/lib/domain/ports";
import type { MessagingDb } from "@/lib/whatsapp/ports";

/**
 * The one Anthropic SDK call runAgent needs, narrowed to a port so tests can
 * inject a scripted fake instead of hitting the real API — same "narrow
 * port + injected fake" pattern as DomainDb/MessagingDb. Production wiring
 * is /lib/agent/client.ts.
 */
export interface ModelClient {
  createMessage(params: {
    model: string;
    system: string;
    messages: Anthropic.Messages.MessageParam[];
    tools: Anthropic.Messages.Tool[];
    maxTokens: number;
  }): Promise<Anthropic.Messages.Message>;
}

export interface AgentDeps {
  domainDb: DomainDb;
  messaging: MessagingDb;
  model: ModelClient;
  /** Injectable for tests; defaults to `new Date()`. */
  now?: () => Date;
  /** Observability hook for tests/evals — fires after every tool call this turn. */
  onToolCall?: (name: string, input: unknown, resultContent: string) => void;
}
