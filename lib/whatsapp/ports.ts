export type ConversationMode = "AI" | "HUMAN";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageSender = "customer" | "ai" | "owner";
export type OwnerNotificationType =
  | "DELAY"
  | "PICKUP_CHANGE"
  | "EXTENSION_REQUEST"
  | "NEEDS_HUMAN"
  | "DOC_REVIEW"
  | "CASH_ISSUE"
  | "OTHER";

export interface CustomerRow {
  id: string;
  customerCode: string;
  whatsappNumber: string;
  fullName: string | null;
}

/**
 * Agent working memory (current booking draft id, flow flags) — not a source
 * of truth for booking data (bookings is). See conversations.state in
 * supabase/migrations/20260922101100_conversations.sql.
 */
export type ConversationState = Record<string, unknown>;

export interface ConversationRow {
  id: string;
  customerId: string;
  mode: ConversationMode;
  state: ConversationState;
}

export interface StoreMessageInput {
  conversationId: string;
  direction: MessageDirection;
  sender: MessageSender;
  body: string;
  /** Present for inbound messages (used to dedupe); null for most outbound sends. */
  whatsappMessageId?: string | null;
}

export interface MessageRow {
  id: string;
  direction: MessageDirection;
  sender: MessageSender;
  body: string;
  createdAt: string;
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
  getCustomerById(customerId: string): Promise<CustomerRow | null>;
  updateCustomerFullName(
    customerId: string,
    fullName: string,
  ): Promise<CustomerRow>;
  /** One conversation per customer in practice — creates one if none exists yet. */
  getOrCreateConversation(customerId: string): Promise<ConversationRow>;
  getConversationById(conversationId: string): Promise<ConversationRow | null>;
  storeMessage(input: StoreMessageInput): Promise<void>;
  /** Most recent `limit` messages, oldest first — the agent's turn history. */
  listRecentMessages(
    conversationId: string,
    limit: number,
  ): Promise<MessageRow[]>;
  setConversationMode(
    conversationId: string,
    mode: ConversationMode,
  ): Promise<void>;
  /** Agent working memory — see ConversationState. */
  updateConversationState(
    conversationId: string,
    state: ConversationState,
  ): Promise<void>;
  /** True if an OPEN notification of this type already exists for the booking. */
  hasOpenNotificationForBooking(
    bookingId: string,
    type: OwnerNotificationType,
  ): Promise<boolean>;
  createOwnerNotification(input: CreateOwnerNotificationInput): Promise<void>;
  /** Count of OPEN notifications across a set of bookings — used for the customer context summary. */
  countOpenNotificationsForBookings(bookingIds: string[]): Promise<number>;
}
