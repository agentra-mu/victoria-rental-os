import type { BookingStatus } from "@/lib/domain/bookingStatus";
import { replyBodyText, textReply, type WhatsAppReply } from "./replies";
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
  escalateBookingToHuman(bookingId: string): Promise<void>;
  runAgent(conversationId: string): Promise<WhatsAppReply[]>;
}

const HUMAN_TAKEOVER_WORDS = new Set(["human", "agent"]);

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

async function handleTakeoverRequest(
  deps: InboundDeps,
  customer: CustomerRow,
  conversation: ConversationRow,
  rawText: string,
): Promise<InboundResult> {
  await deps.messaging.setConversationMode(conversation.id, "HUMAN");

  const activeBooking = await deps.getActiveBookingForCustomer(customer.id);
  if (activeBooking) {
    await deps.escalateBookingToHuman(activeBooking.id);
  }

  const title = `${customer.whatsappNumber} asked for a human`;
  await notifyOwnerIfNotAlreadyOpen(
    deps,
    title,
    rawText,
    activeBooking?.id ?? null,
  );

  const reply = textReply(
    "Thanks — a member of our team will be in touch with you shortly.",
  );
  await deps.messaging.storeMessage({
    conversationId: conversation.id,
    direction: "OUTBOUND",
    sender: "owner",
    body: replyBodyText(reply),
  });

  return { replies: [reply], notifyOwner: { title, body: rawText } };
}

/**
 * The core of /app/api/whatsapp/inbound: dedupe, customer/conversation
 * lookup, message storage, takeover check, and (otherwise) the AI reply.
 * Kept free of Next.js/Supabase specifics so it's unit-testable — see
 * inbound.test.ts.
 */
export async function handleInboundMessage(
  deps: InboundDeps,
  payload: InboundMessagePayload,
): Promise<InboundResult> {
  const alreadySeen = await deps.messaging.findMessageByWhatsAppId(
    payload.messageId,
  );
  if (alreadySeen) return { replies: [] };

  const customer = await deps.messaging.findOrCreateCustomer(
    normalizeWhatsAppNumber(payload.from),
  );
  const conversation = await deps.messaging.getOrCreateConversation(
    customer.id,
  );
  const inboundText = extractInboundText(payload);

  await deps.messaging.storeMessage({
    conversationId: conversation.id,
    direction: "INBOUND",
    sender: "customer",
    body: inboundText,
    whatsappMessageId: payload.messageId,
  });

  if (conversation.mode === "HUMAN") {
    const activeBooking = await deps.getActiveBookingForCustomer(customer.id);
    await notifyOwnerIfNotAlreadyOpen(
      deps,
      `New message from ${customer.whatsappNumber}`,
      inboundText,
      activeBooking?.id ?? null,
    );
    return { replies: [] };
  }

  if (
    payload.type === "text" &&
    HUMAN_TAKEOVER_WORDS.has(inboundText.trim().toLowerCase())
  ) {
    return handleTakeoverRequest(deps, customer, conversation, inboundText);
  }

  const replies = await deps.runAgent(conversation.id);
  for (const reply of replies) {
    await deps.messaging.storeMessage({
      conversationId: conversation.id,
      direction: "OUTBOUND",
      sender: "ai",
      body: replyBodyText(reply),
    });
  }
  return { replies };
}
