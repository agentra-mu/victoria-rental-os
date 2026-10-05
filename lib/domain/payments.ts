import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "./errors";

/**
 * Only called from the owner dashboard server actions (behind requireAction).
 * No agent tool or n8n route imports this — there is a test asserting that.
 * The DB trigger additionally refuses PAID without a payments row.
 */
export async function markAsPaid(
  client: SupabaseClient,
  bookingId: string,
  staffUserId: string,
): Promise<void> {
  const { data: booking, error } = await client
    .from("bookings")
    .select("total_rs, payment_status")
    .eq("id", bookingId)
    .single();
  if (error || !booking) {
    throw new DomainError("BOOKING_NOT_FOUND", "Booking not found");
  }
  if (booking.payment_status === "PAID") return;

  const { error: payErr } = await client.from("payments").insert({
    booking_id: bookingId,
    amount_rs: booking.total_rs ?? 0,
    method: "CASH",
    marked_paid_by: staffUserId,
  });
  if (payErr) throw new Error(payErr.message);

  const { error: upErr } = await client
    .from("bookings")
    .update({ payment_status: "PAID" })
    .eq("id", bookingId);
  if (upErr) throw new Error(upErr.message);

  await client.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "MARKED_PAID",
    actor: "owner",
    actor_user_id: staffUserId,
    payload: { amountRs: booking.total_rs },
  });
}

/** OWNER-only (enforced by the caller via the undo_payment permission). Reason required. */
export async function undoMarkAsPaid(
  client: SupabaseClient,
  bookingId: string,
  staffUserId: string,
  reason: string,
): Promise<void> {
  if (!reason.trim()) throw new Error("A reason is required to undo a payment");
  await client.from("payments").delete().eq("booking_id", bookingId);
  const { error } = await client
    .from("bookings")
    .update({ payment_status: "UNPAID" })
    .eq("id", bookingId);
  if (error) throw new Error(error.message);
  await client.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "PAYMENT_UNDONE",
    actor: "owner",
    actor_user_id: staffUserId,
    payload: { reason },
  });
}
