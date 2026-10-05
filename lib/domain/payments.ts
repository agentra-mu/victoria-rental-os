import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Only called from the owner dashboard (server action behind the dashboard
 * login). No agent tool or n8n route imports this. MVP: staff identity is the
 * STAFF_USER_ID env var (an existing staff_users row).
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
  if (error || !booking) throw new Error("Booking not found");
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
}
