import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type {
  ConversationRow,
  CreateOwnerNotificationInput,
  CustomerRow,
  MessagingDb,
  StoreMessageInput,
} from "@/lib/whatsapp/ports";

type Client = SupabaseClient<Database>;
type CustomerTableRow = Database["public"]["Tables"]["customers"]["Row"];
type ConversationTableRow =
  Database["public"]["Tables"]["conversations"]["Row"];

function mapCustomer(row: CustomerTableRow): CustomerRow {
  return {
    id: row.id,
    whatsappNumber: row.whatsapp_number,
    fullName: row.full_name,
  };
}

function mapConversation(row: ConversationTableRow): ConversationRow {
  return { id: row.id, customerId: row.customer_id, mode: row.mode };
}

/**
 * Supabase-backed implementation of the MessagingDb port (see
 * /lib/whatsapp/ports.ts) — customers, conversations, messages and owner
 * notifications for the WhatsApp inbound flow.
 */
export function createSupabaseMessagingDb(client: Client): MessagingDb {
  return {
    async findMessageByWhatsAppId(whatsappMessageId) {
      const { data, error } = await client
        .from("messages")
        .select("id")
        .eq("whatsapp_message_id", whatsappMessageId)
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id } : null;
    },

    async findOrCreateCustomer(whatsappNumber) {
      const { data: existing, error: findError } = await client
        .from("customers")
        .select("*")
        .eq("whatsapp_number", whatsappNumber)
        .maybeSingle();
      if (findError) throw findError;
      if (existing) return mapCustomer(existing);

      const { data: created, error: insertError } = await client
        .from("customers")
        .insert({ whatsapp_number: whatsappNumber })
        .select("*")
        .single();
      if (insertError) throw insertError;
      return mapCustomer(created);
    },

    async getOrCreateConversation(customerId) {
      const { data: existing, error: findError } = await client
        .from("conversations")
        .select("*")
        .eq("customer_id", customerId)
        .limit(1)
        .maybeSingle();
      if (findError) throw findError;
      if (existing) return mapConversation(existing);

      const { data: created, error: insertError } = await client
        .from("conversations")
        .insert({ customer_id: customerId })
        .select("*")
        .single();
      if (insertError) throw insertError;
      return mapConversation(created);
    },

    async storeMessage(input: StoreMessageInput) {
      const { error } = await client.from("messages").insert({
        conversation_id: input.conversationId,
        direction: input.direction,
        sender: input.sender,
        body: input.body,
        whatsapp_message_id: input.whatsappMessageId ?? null,
      });
      if (error) throw error;

      const { error: touchError } = await client
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", input.conversationId);
      if (touchError) throw touchError;
    },

    async setConversationMode(conversationId, mode) {
      const { error } = await client
        .from("conversations")
        .update({ mode })
        .eq("id", conversationId);
      if (error) throw error;
    },

    async hasOpenNotificationForBooking(bookingId, type) {
      const { error, count } = await client
        .from("owner_notifications")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", bookingId)
        .eq("type", type)
        .eq("status", "OPEN");
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async createOwnerNotification(input: CreateOwnerNotificationInput) {
      const { error } = await client.from("owner_notifications").insert({
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        booking_id: input.bookingId ?? null,
      });
      if (error) throw error;
    },
  };
}
