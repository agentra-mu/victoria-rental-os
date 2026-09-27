import type {
  ConversationRow,
  CreateOwnerNotificationInput,
  CustomerRow,
  MessagingDb,
  OwnerNotificationType,
  StoreMessageInput,
} from "../ports";

interface StoredMessage extends StoreMessageInput {
  id: string;
  createdAt: string;
}

interface StoredNotification extends CreateOwnerNotificationInput {
  id: string;
  status: "OPEN" | "RESOLVED";
}

let counter = 1;
const nextId = (prefix: string) => `${prefix}-${counter++}`;

export function createFakeMessagingDb(
  seed: { customers?: CustomerRow[]; conversations?: ConversationRow[] } = {},
) {
  const customers = new Map(
    seed.customers?.map((c) => [c.whatsappNumber, c]) ?? [],
  );
  const conversations = new Map(
    seed.conversations?.map((c) => [c.customerId, c]) ?? [],
  );
  const messages: StoredMessage[] = [];
  const notifications: StoredNotification[] = [];

  const db: MessagingDb = {
    async findMessageByWhatsAppId(whatsappMessageId) {
      const found = messages.find(
        (m) => m.whatsappMessageId === whatsappMessageId,
      );
      return found ? { id: found.id } : null;
    },

    async findOrCreateCustomer(whatsappNumber) {
      const existing = customers.get(whatsappNumber);
      if (existing) return existing;
      const customer: CustomerRow = {
        id: nextId("cust"),
        customerCode: `CUST-${String(counter).padStart(6, "0")}`,
        whatsappNumber,
        fullName: null,
      };
      customers.set(whatsappNumber, customer);
      return customer;
    },

    async getCustomerById(customerId) {
      return (
        Array.from(customers.values()).find((c) => c.id === customerId) ?? null
      );
    },

    async updateCustomerFullName(customerId, fullName) {
      const customer = Array.from(customers.values()).find(
        (c) => c.id === customerId,
      );
      if (!customer) throw new Error(`No fake customer ${customerId}`);
      customer.fullName = fullName;
      return customer;
    },

    async getOrCreateConversation(customerId) {
      const existing = conversations.get(customerId);
      if (existing) return existing;
      const conversation: ConversationRow = {
        id: nextId("conv"),
        customerId,
        mode: "AI",
        state: {},
      };
      conversations.set(customerId, conversation);
      return conversation;
    },

    async getConversationById(conversationId) {
      return (
        Array.from(conversations.values()).find(
          (c) => c.id === conversationId,
        ) ?? null
      );
    },

    async storeMessage(input) {
      messages.push({
        ...input,
        id: nextId("msg"),
        createdAt: new Date(Date.now() + messages.length).toISOString(),
      });
    },

    async listRecentMessages(conversationId, limit) {
      return messages
        .filter((m) => m.conversationId === conversationId)
        .slice(-limit)
        .map((m) => ({
          id: m.id,
          direction: m.direction,
          sender: m.sender,
          body: m.body,
          createdAt: m.createdAt,
        }));
    },

    async setConversationMode(conversationId, mode) {
      for (const conversation of conversations.values()) {
        if (conversation.id === conversationId) conversation.mode = mode;
      }
    },

    async updateConversationState(conversationId, state) {
      for (const conversation of conversations.values()) {
        if (conversation.id === conversationId) conversation.state = state;
      }
    },

    async hasOpenNotificationForBooking(bookingId, type) {
      return notifications.some(
        (n) =>
          n.bookingId === bookingId && n.type === type && n.status === "OPEN",
      );
    },

    async createOwnerNotification(input) {
      notifications.push({ ...input, id: nextId("notif"), status: "OPEN" });
    },
  };

  return { db, customers, conversations, messages, notifications };
}

export type { OwnerNotificationType };
