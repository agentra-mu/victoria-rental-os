import type { BookingStatus } from "@/lib/domain/bookingStatus";
import type { InboundMessage } from "@/lib/bot/handleTurn";
import { matchCommand } from "@/lib/bot/lexicon";
import { getTemplates } from "@/lib/bot/templates";
import type { HandledBy, TurnResult } from "@/lib/bot/types";
import { replyBodyText, type WhatsAppReply } from "./replies";
import type { ConversationRow, CustomerRow, MessagingDb } from "./ports";

export type InboundMessageType =
  "text" | "button_reply" | "list_reply" | "image" | "document" | "location";

/** The normalized shape n8n posts to /app/api/whatsapp/inbound (see /n8n/README.md). */
export interface InboundMessagePayload {
  /** wa_id from Meta's webhook, e.g. "23057611111" — no leading "+". */
  from: string;
  messageId: string;
  timestamp: string;
  type: InboundMessageType;
  text?: string;
  /** id of the selected button/list row, for interactive replies. */
  replyId?: string;
}

export interface InboundResult {
  replies: WhatsAppReply[];
  notifyOwner?: { title: string; body?: string };
  /** Which bot layer answered, and what it parsed — shown in /dev/simulator. */
  debug?: { layer: HandledBy; trace: TurnResult["trace"] };
}

/**
 * Everything handleInboundMessage needs, injected so it's unit-testable
 * without Postgres. Production wiring lives in
 * /app/api/whatsapp/inbound/route.ts.
 */
export interface InboundDeps {
  messaging: MessagingDb;
  getActiveBookingForCustomer(
    customerId: string,
  ): Promise<{ id: string; status: BookingStatus } | null>;
  /** The bot: lib/bot/handleTurn.ts in production. */
  runBot(
    conversationId: string,
    message: InboundMessage,
    preloaded: { customer: CustomerRow; conversation: ConversationRow },
  ): Promise<TurnResult>;
}

/** Meta's webhook `from` has no "+"; our customers.whatsapp_number is E.164. */
export function normalizeWhatsAppNumber(from: string): string {
  const trimmed = from.trim();
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

function extractInboundText(payload: InboundMessagePayload): string {
  if (payload.text) return payload.text;
  if (payload.replyId) return payload.replyId;
  return `[${payload.type}]`;
}

async function notifyOwnerIfNotAlreadyOpen(
  deps: InboundDeps,
  title: string,
  body: string,
  bookingId: string | null,
): Promise<void> {
  if (bookingId) {
    const alreadyOpen = await deps.messaging.hasOpenNotificationForBooking(
      bookingId,
      "NEEDS_HUMAN",
    );
    if (alreadyOpen) return;
  }
  await deps.messaging.createOwnerNotification({
    type: "NEEDS_HUMAN",
    title,
    body,
    bookingId,
  });
}

/**
 * The shell around the bot: dedupe (race-safe on the unique
 * whatsapp_message_id), customer/conversation lookup in one read, message
 * storage, the HUMAN-mode passthrough, then handleTurn (lib/bot) and storing
 * its replies tagged with the layer that produced them.
 */
export async function handleInboundMessage(
  deps: InboundDeps,
  payload: InboundMessagePayload,
): Promise<InboundResult> {
  const { customer, conversation } =
    await deps.messaging.loadCustomerAndConversation(
      normalizeWhatsAppNumber(payload.from),
    );
  const inboundText = extractInboundText(payload);

  // Insert-first dedupe: a retried webhook hits the unique index and stops here.
  const isNew = await deps.messaging.storeInboundIfNew({
    conversationId: conversation.id,
    direction: "INBOUND",
    sender: "customer",
    body: inboundText,
    whatsappMessageId: payload.messageId,
  });
  if (!isNew) return { replies: [] };

  if (conversation.mode === "HUMAN") {
    // A person owns this chat: only the STOP/START opt-out still works.
    const command = payload.type === "text" ? matchCommand(inboundText) : null;
    if (command?.name === "stop" || command?.name === "start") {
      const optedOut = command.name === "stop";
      await deps.messaging.setCustomerOptOut(customer.id, optedOut);
      const t = getTemplates(customer.preferredLanguage ?? "en");
      const reply = optedOut ? t.optedOut() : t.optedIn();
      await deps.messaging.storeMessage({
        conversationId: conversation.id,
        direction: "OUTBOUND",
        sender: "ai",
        body: replyBodyText(reply),
        handledBy: "command",
      });
      return { replies: [reply] };
    }
    const activeBooking = await deps.getActiveBookingForCustomer(customer.id);
    await notifyOwnerIfNotAlreadyOpen(
      deps,
      `New message from ${customer.whatsappNumber}`,
      inboundText,
      activeBooking?.id ?? null,
    );
    return { replies: [] };
  }

  const result = await deps.runBot(
    conversation.id,
    {
      messageId: payload.messageId,
      type: payload.type,
      text: payload.text,
      replyId: payload.replyId,
    },
    { customer, conversation },
  );

  for (const reply of result.replies) {
    await deps.messaging.storeMessage({
      conversationId: conversation.id,
      direction: "OUTBOUND",
      sender: "ai",
      body: replyBodyText(reply),
      handledBy: result.handledBy,
      generatedBy: result.generatedBy ?? null,
    });
  }
  return {
    replies: result.replies,
    notifyOwner: result.notifyOwner,
    debug: { layer: result.handledBy, trace: result.trace },
  };
}
