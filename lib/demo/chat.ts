import { formatTodayText } from "@/lib/agent/context";
import { buildCustomerContextSummary } from "@/lib/domain/customerContext";
import { escalateBookingToHuman } from "@/lib/domain/escalateBookingToHuman";
import type { DomainDb } from "@/lib/domain/ports";
import type { ConversationMode, MessagingDb } from "@/lib/whatsapp/ports";
import {
  handleInboundMessage,
  normalizeWhatsAppNumber,
} from "@/lib/whatsapp/inbound";
import { replyBodyText } from "@/lib/whatsapp/replies";

/**
 * Web-chat stand-in for /api/whatsapp/inbound. Reuses handleInboundMessage
 * for dedupe, customer/conversation lookup, message storage, the STOP/START
 * and HUMAN-takeover rules — but the "AI turn" itself happens in n8n, so the
 * agent step is replaced by a flag telling n8n to go ahead.
 */
export interface DemoChatDeps {
  messaging: MessagingDb;
  domainDb: DomainDb;
  now?: () => Date;
}

export interface DemoInboundResult {
  /** n8n runs the AI only when this is false. */
  skipAgent: boolean;
  mode: ConversationMode;
  duplicate: boolean;
  /** A reply the system already stored (takeover / STOP / START) — relay it as-is. */
  systemReply: string | null;
  isFirstContact: boolean;
  customerName: string | null;
  customerContext: string;
  /** Mauritius-local, human-readable. Use for relative dates like "tomorrow". */
  today: string;
  nowIso: string;
}

export async function handleDemoInbound(
  deps: DemoChatDeps,
  input: { whatsappNumber: string; text: string; messageId: string },
): Promise<DemoInboundResult> {
  const now = deps.now?.() ?? new Date();
  const number = normalizeWhatsAppNumber(input.whatsappNumber);

  const customer = await deps.messaging.findOrCreateCustomer(number);
  const conversation = await deps.messaging.getOrCreateConversation(
    customer.id,
  );

  const base = async (
    overrides: Partial<DemoInboundResult>,
  ): Promise<DemoInboundResult> => {
    const [current, refreshed, customerContext] = await Promise.all([
      deps.messaging.getConversationById(conversation.id),
      deps.messaging.getCustomerById(customer.id),
      buildCustomerContextSummary(deps, customer.id, now),
    ]);
    return {
      skipAgent: false,
      mode: current?.mode ?? "AI",
      duplicate: false,
      systemReply: null,
      isFirstContact,
      customerName: refreshed?.fullName ?? null,
      customerContext,
      today: formatTodayText(now),
      nowIso: now.toISOString(),
      ...overrides,
    };
  };

  const isFirstContact =
    (await deps.messaging.listRecentMessages(conversation.id, 1)).length === 0;

  if (await deps.messaging.findMessageByWhatsAppId(input.messageId)) {
    return base({ skipAgent: true, duplicate: true });
  }

  let agentRequested = false;
  const result = await handleInboundMessage(
    {
      messaging: deps.messaging,
      getActiveBookingForCustomer: (customerId) =>
        deps.domainDb.getActiveBookingForCustomer(customerId),
      escalateBookingToHuman: async (bookingId) => {
        await escalateBookingToHuman(deps.domainDb, bookingId);
      },
      runAgent: async () => {
        agentRequested = true;
        return [];
      },
    },
    {
      from: number,
      messageId: input.messageId,
      timestamp: String(Math.floor(now.getTime() / 1000)),
      type: "text",
      text: input.text,
    },
  );

  if (agentRequested) return base({});
  return base({
    skipAgent: true,
    systemReply: result.replies[0] ? replyBodyText(result.replies[0]) : null,
  });
}

/** Stores the AI's reply so the dashboard transcript shows both sides. */
export async function handleDemoOutbound(
  deps: Pick<DemoChatDeps, "messaging">,
  input: { whatsappNumber: string; text: string },
): Promise<{ stored: true }> {
  const customer = await deps.messaging.findOrCreateCustomer(
    normalizeWhatsAppNumber(input.whatsappNumber),
  );
  const conversation = await deps.messaging.getOrCreateConversation(
    customer.id,
  );
  await deps.messaging.storeMessage({
    conversationId: conversation.id,
    direction: "OUTBOUND",
    sender: "ai",
    body: input.text,
  });
  return { stored: true };
}
