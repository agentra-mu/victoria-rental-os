"use server";

import { revalidatePath } from "next/cache";
import { audit, requireAction } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { markAsPaid, undoMarkAsPaid } from "@/lib/domain/payments";
import {
  assertTransition,
  type BookingStatus,
} from "@/lib/domain/bookingStatus";
import { reassignBooking } from "@/lib/domain/reassign";
import {
  applyChangeRequest,
  declineChangeRequest,
} from "@/lib/domain/changeRequestsDb";
import {
  customerMessages,
  moreMessages,
  sendToCustomer,
} from "@/lib/notifications/customerMessages";
import { randomBytes } from "node:crypto";

const db = () => getServiceSupabase();

async function booking(id: string) {
  const { data } = await db()
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single();
  if (!data) throw new Error("Booking not found");
  return data;
}
const refresh = (id: string) => revalidatePath(`/dashboard/bookings/${id}`);

export async function payAction(formData: FormData) {
  const staff = await requireAction("mark_paid");
  const id = String(formData.get("id"));
  await markAsPaid(db(), id, staff.id);
  await audit(staff, "payment.mark_paid", "booking", id);
  refresh(id);
}

export async function undoPayAction(formData: FormData) {
  const staff = await requireAction("undo_payment");
  const id = String(formData.get("id"));
  await undoMarkAsPaid(
    db(),
    id,
    staff.id,
    String(formData.get("reason") ?? ""),
  );
  await audit(staff, "payment.undo", "booking", id, {
    reason: formData.get("reason"),
  });
  refresh(id);
}

async function resolveDocNotifications(id: string) {
  await db()
    .from("owner_notifications")
    .update({ status: "RESOLVED", resolved_at: new Date().toISOString() })
    .eq("booking_id", id)
    .eq("type", "DOC_REVIEW")
    .eq("status", "OPEN");
}

export async function approveDocsAction(formData: FormData) {
  const staff = await requireAction("view_documents");
  const id = String(formData.get("id"));
  const b = await booking(id);
  const patch: Record<string, unknown> = { document_status: "VERIFIED" };
  if (b.status === "PENDING_DOCUMENTS") patch.status = "DOCUMENTS_VERIFIED";
  await db().from("bookings").update(patch).eq("id", id);
  await db()
    .from("document_verifications")
    .update({ reviewed_by: staff.id, reviewed_at: new Date().toISOString() })
    .in(
      "document_id",
      (
        await db().from("documents").select("id").eq("booking_id", id)
      ).data?.map((d) => d.id) ?? [],
    );
  await resolveDocNotifications(id);
  await audit(staff, "documents.approve", "booking", id);
  await sendToCustomer(
    b.customer_id,
    customerMessages.documentsVerified(b.total_rs ?? 0),
  );
  refresh(id);
}

export async function reuploadAction(formData: FormData) {
  const staff = await requireAction("view_documents");
  const id = String(formData.get("id"));
  const b = await booking(id);
  const token = randomBytes(24).toString("base64url");
  await db()
    .from("bookings")
    .update({
      upload_token: token,
      upload_token_expires_at: new Date(Date.now() + 72 * 3600e3).toISOString(),
      document_status: "NOT_SUBMITTED",
    })
    .eq("id", id);
  await audit(staff, "documents.request_reupload", "booking", id);
  await sendToCustomer(
    b.customer_id,
    customerMessages.reupload(`${process.env.APP_URL}/documents/${token}`),
  );
  refresh(id);
}

/** OWNER only: reject with a reason → NEEDS_HUMAN, customer notified politely. */
export async function rejectDocsAction(formData: FormData) {
  const staff = await requireAction("reject_documents");
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A reason is required");
  const b = await booking(id);
  await db()
    .from("bookings")
    .update({ document_status: "REJECTED", status: "NEEDS_HUMAN" })
    .eq("id", id);
  await resolveDocNotifications(id);
  await audit(staff, "documents.reject", "booking", id, { reason });
  await sendToCustomer(b.customer_id, moreMessages.rejected(b.booking_number));
  refresh(id);
}

export async function setStatusAction(formData: FormData) {
  const staff = await requireAction("bookings");
  const id = String(formData.get("id"));
  const to = String(formData.get("to")) as BookingStatus;
  const b = await booking(id);
  assertTransition(b.status, to);
  await db().from("bookings").update({ status: to }).eq("id", id);
  await audit(staff, "booking.status", "booking", id, { from: b.status, to });
  if (to === "CANCELLED")
    await sendToCustomer(
      b.customer_id,
      customerMessages.cancelled(b.booking_number),
    );
  refresh(id);
}

export async function saveNotesAction(formData: FormData) {
  const staff = await requireAction("bookings");
  const id = String(formData.get("id"));
  await db()
    .from("bookings")
    .update({ notes: String(formData.get("notes") ?? "") })
    .eq("id", id);
  await audit(staff, "booking.notes", "booking", id);
  refresh(id);
}

export async function reassignAction(formData: FormData) {
  const staff = await requireAction("fleet");
  const id = String(formData.get("id"));
  await reassignBooking(db(), id, String(formData.get("vehicleId")), staff.id);
  await audit(staff, "booking.reassign", "booking", id, {
    vehicleId: formData.get("vehicleId"),
  });
  refresh(id);
}

export async function approveRequestAction(formData: FormData) {
  const staff = await requireAction("approve_requests");
  const requestId = String(formData.get("requestId"));
  const id = String(formData.get("id"));
  const outcome = await applyChangeRequest(db(), requestId, staff.id);
  await audit(staff, "request.approve", "change_request", requestId);
  const b = await booking(id);
  await sendToCustomer(b.customer_id, outcome.customerMessage);
  refresh(id);
}

export async function declineRequestAction(formData: FormData) {
  const staff = await requireAction("approve_requests");
  const requestId = String(formData.get("requestId"));
  const id = String(formData.get("id"));
  const out = await declineChangeRequest(
    db(),
    requestId,
    staff.id,
    String(formData.get("reason") ?? "") || undefined,
  );
  await audit(staff, "request.decline", "change_request", requestId);
  await sendToCustomer(out.customerId, out.customerMessage);
  refresh(id);
}
