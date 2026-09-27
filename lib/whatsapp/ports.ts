export type ConversationMode = "AI" | "HUMAN";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageSender = "customer" | "ai" | "owner";
export type OwnerNotificationType =
  | "DELAY"
  | "PICKUP_CHANGE"
  | "EXTENSION_REQUEST"
  | "NEEDS_HUMAN"
  | "DOC_REVIEW"
  | "CASH_ISSUE";

export interface CustomerRow {
  id: string;
  whatsappNumber: string;
  fullName: string | null;
}

export interface ConversationRow {
  id: string;
  customerId: string;
  mode: ConversationMode;
}

export interface StoreMessageInput {
  conversationId: string;
  direction: MessageDirection;
  sender: MessageSender;
  body: string;
  /** Present for inbound messages (used to dedupe); null for most outbound sends. */
  whatsappMessageId?: string | null;
}

export interface CreateOwnerNotificationInput {
  type: OwnerNotificationType;
  title: string;
  body?: string;
  bookingId?: string | null;
}

/**
 * Everything the WhatsApp inbound flow needs from storage — customers,
 * conversations, messages, owner notifications. Kept separate from the
 * booking engine's DomainDb (/lib/domain/ports.ts): different bounded
 * context, same "narrow port + injected fake for tests" pattern.
 */
export interface MessagingDb {
  findMessageByWhatsAppId(
    whatsappMessageId: string,
  ): Promise<{ id: string } | null>;
  findOrCreateCustomer(whatsappNumber: string): Promise<CustomerRow>;
  /** One conversation per customer in practice — creates one if none exists yet. */
  getOrCreateConversation(customerId: string): Promise<ConversationRow>;
  storeMessage(input: StoreMessageInput): Promise<void>;
  setConversationMode(
    conversationId: string,
    mode: ConversationMode,
  ): Promise<void>;
  /** True if an OPEN notification of this type already exists for the booking. */
  hasOpenNotificationForBooking(
    bookingId: string,
    type: OwnerNotificationType,
  ): Promise<boolean>;
  createOwnerNotification(input: CreateOwnerNotificationInput): Promise<void>;
}
