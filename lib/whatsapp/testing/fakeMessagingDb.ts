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
        whatsappNumber,
        fullName: null,
      };
      customers.set(whatsappNumber, customer);
      return customer;
    },

    async getOrCreateConversation(customerId) {
      const existing = conversations.get(customerId);
      if (existing) return existing;
      const conversation: ConversationRow = {
        id: nextId("conv"),
        customerId,
        mode: "AI",
      };
      conversations.set(customerId, conversation);
      return conversation;
    },

    async storeMessage(input) {
      messages.push({ ...input, id: nextId("msg") });
    },

    async setConversationMode(conversationId, mode) {
      for (const conversation of conversations.values()) {
        if (conversation.id === conversationId) conversation.mode = mode;
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
