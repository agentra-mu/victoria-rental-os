import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { markAsPaid } from "@/lib/domain/payments";
import {
  ALLOWED_TRANSITIONS,
  type BookingStatus,
} from "@/lib/domain/bookingStatus";
import {
  customerMessages,
  sendToCustomer,
} from "@/lib/notifications/customerMessages";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const db = getServiceSupabase();
  const { data: b } = await db
    .from("bookings")
    .select(
      "*, customers(full_name, whatsapp_number), vehicles(make, model, registration)",
    )
    .eq("id", id)
    .single();
  if (!b) notFound();
  const { data: docs } = await db
    .from("documents")
    .select("id, doc_type, storage_path")
    .eq("booking_id", id)
    .is("deleted_at", null);

  const docLinks = await Promise.all(
    (docs ?? []).map(async (d) => {
      const { data } = await db.storage
        .from("documents")
        .createSignedUrl(d.storage_path, 60);
      return { ...d, url: data?.signedUrl };
    }),
  );

  const c = b.customers as {
    full_name: string | null;
    whatsapp_number: string;
  } | null;
  const v = b.vehicles as {
    make: string;
    model: string;
    registration: string;
  } | null;
  const next = [...(ALLOWED_TRANSITIONS.get(b.status as BookingStatus) ?? [])];

  async function pay() {
    "use server";
    await requireAuth();
    const staff = process.env.STAFF_USER_ID;
    if (!staff) throw new Error("STAFF_USER_ID not set");
    await markAsPaid(getServiceSupabase(), id, staff);
    revalidatePath(`/dashboard/bookings/${id}`);
  }
  async function approve() {
    "use server";
    await requireAuth();
    const d = getServiceSupabase();
    await d
      .from("bookings")
      .update({ document_status: "VERIFIED", status: "DOCUMENTS_VERIFIED" })
      .eq("id", id);
    await d
      .from("owner_notifications")
      .update({ status: "RESOLVED", resolved_at: new Date().toISOString() })
      .eq("booking_id", id)
      .eq("type", "DOC_REVIEW");
    await sendToCustomer(
      b!.customer_id,
      customerMessages.documentsVerified(b!.total_rs ?? 0),
    );
    revalidatePath(`/dashboard/bookings/${id}`);
  }
  async function reupload() {
    "use server";
    await requireAuth();
    const d = getServiceSupabase();
    const token = crypto.randomUUID().replace(/-/g, "");
    await d
      .from("bookings")
      .update({
        upload_token: token,
        upload_token_expires_at: new Date(
          Date.now() + 72 * 3600e3,
        ).toISOString(),
        document_status: "NEEDS_REVIEW",
      })
      .eq("id", id);
    await sendToCustomer(
      b!.customer_id,
      customerMessages.reupload(`${process.env.APP_URL}/documents/${token}`),
    );
    revalidatePath(`/dashboard/bookings/${id}`);
  }
  async function setStatus(formData: FormData) {
    "use server";
    await requireAuth();
    const to = String(formData.get("to")) as BookingStatus;
    if (!ALLOWED_TRANSITIONS.get(b!.status as BookingStatus)?.has(to)) return;
    await getServiceSupabase()
      .from("bookings")
      .update({ status: to })
      .eq("id", id);
    if (to === "CANCELLED")
      await sendToCustomer(
        b!.customer_id,
        customerMessages.cancelled(b!.booking_number),
      );
    revalidatePath(`/dashboard/bookings/${id}`);
  }
  async function saveNotes(formData: FormData) {
    "use server";
    await requireAuth();
    await getServiceSupabase()
      .from("bookings")
      .update({ notes: String(formData.get("notes") ?? "") })
      .eq("id", id);
    revalidatePath(`/dashboard/bookings/${id}`);
  }

  const btn = "rounded border px-3 py-2 text-sm";
  return (
    <main className="mx-auto max-w-2xl p-4">
      <Link href="/dashboard" className="text-sm underline">
        ← Back
      </Link>
      <h1 className="my-3 text-xl font-semibold">
        Booking #{b.booking_number}
      </h1>
      <div className="mb-4 text-sm leading-6">
        <div>
          Customer: {c?.full_name ?? "—"} ({c?.whatsapp_number})
        </div>
        <div>Car: {v ? `${v.make} ${v.model} · ${v.registration}` : "—"}</div>
        <div>
          Dates:{" "}
          {b.pickup_at
            ? new Date(b.pickup_at).toLocaleString("en-GB", {
                timeZone: "Indian/Mauritius",
              })
            : "—"}{" "}
          →{" "}
          {b.return_at
            ? new Date(b.return_at).toLocaleString("en-GB", {
                timeZone: "Indian/Mauritius",
              })
            : "—"}{" "}
          ({b.rental_days ?? "?"} days)
        </div>
        <div>Total: Rs {b.total_rs ?? "—"}</div>
        <div>
          Status: <b>{b.status}</b> · Docs: <b>{b.document_status}</b> ·
          Payment: <b>{b.payment_status}</b>
        </div>
      </div>

      <h2 className="mb-2 font-semibold">Documents</h2>
      <ul className="mb-2 text-sm">
        {docLinks.map((d) => (
          <li key={d.id}>
            {d.doc_type}:{" "}
            {d.url ? (
              <a className="underline" href={d.url} target="_blank">
                View (60s link)
              </a>
            ) : (
              "unavailable"
            )}
          </li>
        ))}
        {docLinks.length === 0 && <li>None uploaded</li>}
      </ul>
      <div className="mb-4 flex gap-2">
        <form action={approve}>
          <button className={btn}>Approve documents</button>
        </form>
        <form action={reupload}>
          <button className={btn}>Request re-upload</button>
        </form>
      </div>

      <h2 className="mb-2 font-semibold">Payment (cash)</h2>
      {b.payment_status === "PAID" ? (
        <p className="mb-4 text-sm">Paid ✔</p>
      ) : (
        <form action={pay} className="mb-4">
          <button className={btn}>Mark as Paid (Rs {b.total_rs ?? 0})</button>
        </form>
      )}

      <h2 className="mb-2 font-semibold">Change status</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        {next.map((s) => (
          <form key={s} action={setStatus}>
            <input type="hidden" name="to" value={s} />
            <button className={btn}>{s}</button>
          </form>
        ))}
      </div>

      <h2 className="mb-2 font-semibold">Notes</h2>
      <form action={saveNotes} className="flex flex-col gap-2">
        <textarea
          name="notes"
          defaultValue={b.notes ?? ""}
          className="rounded border p-2"
          rows={3}
        />
        <button className={btn}>Save notes</button>
      </form>
    </main>
  );
}
