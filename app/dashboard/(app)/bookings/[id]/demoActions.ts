"use server";

import { revalidatePath } from "next/cache";
import { audit, requireAction } from "@/lib/dashboard/auth";
import { assertTransition } from "@/lib/domain/bookingStatus";
import { createSupabaseMessagingDb } from "@/lib/db/messagingDb";
import { customerMessages } from "@/lib/notifications/customerMessages";
import { DEMO_PUSH_ID_PREFIX } from "@/lib/whatsapp/send";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * DEMO_MODE only: stands in for the customer uploading documents and the
 * verification step (no OCR in the demo). Real document verification is
 * unchanged elsewhere, and still never auto-rejects.
 */
function requireDemo() {
  if (process.env.DEMO_MODE !== "true") throw new Error("Demo mode is off");
}

const SAMPLE_REASONS = [
  "Name on the driving permit does not exactly match the booking name",
  "Driving permit expires before the return date",
];

async function loadPendingBooking(id: string) {
  const { data } = await getServiceSupabase()
    .from("bookings")
    .select("id, status, customer_id, booking_number, total_rs")
    .eq("id", id)
    .single();
  if (!data) throw new Error("Booking not found");
  if (data.status !== "PENDING_DOCUMENTS")
    throw new Error("Booking is not waiting for documents");
  return data;
}

/** → DOCUMENTS_VERIFIED → CONFIRMED, logs events, and sends the customer the cash-payment instructions. */
export async function simulateVerifiedAction(formData: FormData) {
  requireDemo();
  const staff = await requireAction("bookings");
  const id = String(formData.get("id"));
  const b = await loadPendingBooking(id);
  const db = getServiceSupabase();

  assertTransition("PENDING_DOCUMENTS", "DOCUMENTS_VERIFIED");
  await db
    .from("bookings")
    .update({ document_status: "VERIFIED", status: "DOCUMENTS_VERIFIED" })
    .eq("id", id);
  assertTransition("DOCUMENTS_VERIFIED", "CONFIRMED");
  await db.from("bookings").update({ status: "CONFIRMED" }).eq("id", id);

  await db
    .from("owner_notifications")
    .update({ status: "RESOLVED", resolved_at: new Date().toISOString() })
    .eq("booking_id", id)
    .eq("type", "DOC_REVIEW")
    .eq("status", "OPEN");
  await db.from("booking_events").insert({
    booking_id: id,
    event_type: "DEMO_DOCUMENTS_SIMULATED",
    actor: "owner",
    actor_user_id: staff.id,
    payload: { result: "VERIFIED" },
  });
  await audit(staff, "demo.simulate_verified", "booking", id);
  // The bot "tells" the customer: stored as an AI message; /demo picks it up by its id prefix.
  const messaging = createSupabaseMessagingDb(db as never);
  const conversation = await messaging.getOrCreateConversation(b.customer_id);
  await messaging.storeMessage({
    conversationId: conversation.id,
    direction: "OUTBOUND",
    sender: "ai",
    body: customerMessages.documentsVerified(b.total_rs ?? 0),
    whatsappMessageId: `${DEMO_PUSH_ID_PREFIX}${crypto.randomUUID()}`,
  });
  revalidatePath(`/dashboard/bookings/${id}`);
}

/** Flags the documents for human review with sample reasons (never auto-rejects). */
export async function simulateNeedsReviewAction(formData: FormData) {
  requireDemo();
  const staff = await requireAction("bookings");
  const id = String(formData.get("id"));
  const b = await loadPendingBooking(id);
  const db = getServiceSupabase();

  await db
    .from("bookings")
    .update({ document_status: "NEEDS_REVIEW" })
    .eq("id", id);
  await db.from("owner_notifications").insert({
    booking_id: id,
    type: "DOC_REVIEW",
    title: `Documents need review: booking #${b.booking_number}`,
    body: SAMPLE_REASONS.join("; "),
  });
  await db.from("booking_events").insert({
    booking_id: id,
    event_type: "DEMO_DOCUMENTS_SIMULATED",
    actor: "owner",
    actor_user_id: staff.id,
    payload: { result: "NEEDS_REVIEW", reasons: SAMPLE_REASONS },
  });
  await audit(staff, "demo.simulate_needs_review", "booking", id);
  revalidatePath(`/dashboard/bookings/${id}`);
}
