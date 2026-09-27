import { createAnthropicModelClient } from "@/lib/agent/client";
import { runAgentTurn } from "@/lib/agent/runAgent";
import {
  agentFixtureSeed,
  createAgentFixture,
} from "@/lib/agent/testing/fixtures";
import type { WhatsAppReply } from "@/lib/whatsapp/replies";

export interface ToolCallLogEntry {
  name: string;
  input: unknown;
  resultContent: string;
}

/** Fixed "now" so scenarios can use absolute dates without caring when the eval actually runs. */
export const EVAL_NOW = new Date("2026-10-01T08:00:00+04:00");

/**
 * One customer + conversation, wired to the real Anthropic API (via
 * ANTHROPIC_API_KEY) but an in-memory fake fleet/booking DB — see
 * /lib/agent/evals/README.md for why this isn't the hosted dev DB.
 */
export async function createEvalHarness(whatsappNumber: string) {
  const { fakeDb, fakeMessaging } = createAgentFixture(agentFixtureSeed());
  const customer = await fakeMessaging.db.findOrCreateCustomer(whatsappNumber);
  const conversation = await fakeMessaging.db.getOrCreateConversation(
    customer.id,
  );
  const model = createAnthropicModelClient();

  let toolCalls: ToolCallLogEntry[] = [];

  async function sendCustomerMessage(text: string): Promise<{
    replies: WhatsAppReply[];
    toolCalls: ToolCallLogEntry[];
  }> {
    toolCalls = [];
    await fakeMessaging.db.storeMessage({
      conversationId: conversation.id,
      direction: "INBOUND",
      sender: "customer",
      body: text,
      whatsappMessageId: `eval-${Date.now()}-${Math.random()}`,
    });

    const replies = await runAgentTurn(
      {
        domainDb: fakeDb.db,
        messaging: fakeMessaging.db,
        model,
        now: () => EVAL_NOW,
        onToolCall: (name, input, resultContent) => {
          toolCalls.push({ name, input, resultContent });
        },
      },
      conversation.id,
    );

    for (const reply of replies) {
      await fakeMessaging.db.storeMessage({
        conversationId: conversation.id,
        direction: "OUTBOUND",
        sender: "ai",
        body: reply.type === "text" ? reply.text : reply.interactive.body.text,
      });
    }

    return { replies, toolCalls };
  }

  // Consumes the deterministic main-menu greeting so scenarios start from a
  // real model turn — see runAgentTurn's isFirstContact short-circuit.
  await sendCustomerMessage("Hi");

  return { fakeDb, fakeMessaging, customer, conversation, sendCustomerMessage };
}

export function replyText(replies: WhatsAppReply[]): string {
  return replies
    .map((reply) =>
      reply.type === "text" ? reply.text : reply.interactive.body.text,
    )
    .join("\n");
}

export function toolNames(calls: ToolCallLogEntry[]): string[] {
  return calls.map((call) => call.name);
}
