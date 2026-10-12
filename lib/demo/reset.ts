import type { SupabaseClient } from "@supabase/supabase-js";
import { isDisposableDemoNumber } from "./personas";

/**
 * "Reset conversation" in /demo. Always clears the chat (messages, state, AI mode).
 * For the new-customer persona and custom demo numbers it also deletes the
 * customer and everything they created, so they are a stranger again.
 */
export async function resetDemoConversation(
  db: SupabaseClient,
  whatsappNumber: string,
): Promise<{ removedCustomer: boolean }> {
  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();
  if (!customer) return { removedCustomer: false };

  const { data: conversations } = await db
    .from("conversations")
    .select("id")
    .eq("customer_id", customer.id);
  const conversationIds = (conversations ?? []).map((c) => c.id as string);

  if (!isDisposableDemoNumber(whatsappNumber)) {
    // Existing persona: keep their seeded bookings, only reset the chat.
    if (conversationIds.length > 0) {
      await db.from("messages").delete().in("conversation_id", conversationIds);
      await db
        .from("conversations")
        .update({
          mode: "AI",
          state: {},
          taken_over_by: null,
          taken_over_at: null,
          human_summary: null,
        })
        .in("id", conversationIds);
    }
    // Requests the chat created during a demo run, so the scenario can be repeated.
    const { data: bookings } = await db
      .from("bookings")
      .select("id")
      .eq("customer_id", customer.id);
    const ids = (bookings ?? []).map((b) => b.id as string);
    if (ids.length > 0) {
      await db
        .from("owner_notifications")
        .delete()
        .in("booking_id", ids)
        .in("type", ["DELAY", "PICKUP_CHANGE", "EXTENSION_REQUEST", "OTHER"]);
    }
    return { removedCustomer: false };
  }

  const { data: bookings } = await db
    .from("bookings")
    .select("id")
    .eq("customer_id", customer.id);
  const bookingIds = (bookings ?? []).map((b) => b.id as string);

  const step = async (
    promise: PromiseLike<{ error: { message: string } | null }>,
  ) => {
    const { error } = await promise;
    if (error) throw new Error(error.message);
  };

  if (bookingIds.length > 0) {
    const { data: docs } = await db
      .from("documents")
      .select("id")
      .in("booking_id", bookingIds);
    const docIds = (docs ?? []).map((d) => d.id as string);
    if (docIds.length > 0)
      await step(
        db.from("document_verifications").delete().in("document_id", docIds),
      );
    await step(db.from("documents").delete().in("booking_id", bookingIds));
    await step(
      db.from("booking_change_requests").delete().in("booking_id", bookingIds),
    );
    await step(
      db.from("scheduled_messages").delete().in("booking_id", bookingIds),
    );
    await step(db.from("payments").delete().in("booking_id", bookingIds));
    await step(
      db.from("owner_notifications").delete().in("booking_id", bookingIds),
    );
    await step(db.from("booking_events").delete().in("booking_id", bookingIds));
    await step(db.from("bookings").delete().in("id", bookingIds));
  }
  if (conversationIds.length > 0) {
    await step(
      db.from("messages").delete().in("conversation_id", conversationIds),
    );
    await step(db.from("conversations").delete().in("id", conversationIds));
  }
  await step(db.from("customers").delete().eq("id", customer.id));
  return { removedCustomer: true };
}
