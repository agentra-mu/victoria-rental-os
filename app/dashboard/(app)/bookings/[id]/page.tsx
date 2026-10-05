import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { can } from "@/lib/domain/permissions";
import {
  ALLOWED_TRANSITIONS,
  type BookingStatus,
} from "@/lib/domain/bookingStatus";
import {
  Badge,
  Card,
  btn,
  btnPrimary,
  fmtDateTime,
  input,
} from "../../../_components/ui";
import ConfirmButton from "../../../_components/ConfirmButton";
import ConversationPanel from "../../../_components/ConversationPanel";
import * as A from "./actions";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await requireStaff("bookings");
  const { id } = await params;
  const db = getServiceSupabase();
  const { data: b } = await db
    .from("bookings")
    .select(
      "*, customers(id, full_name, whatsapp_number, customer_code), vehicles(id, make, model, registration, vehicle_code), pickup:locations!bookings_pickup_location_id_fkey(name), dropoff:locations!bookings_dropoff_location_id_fkey(name)",
    )
    .eq("id", id)
    .single();
  if (!b) notFound();

  const [
    { data: docs },
    { data: events },
    { data: requests },
    { data: conv },
    { data: vehicles },
  ] = await Promise.all([
    db
      .from("documents")
      .select(
        "id, doc_type, uploaded_at, document_verifications(result, reasons, extracted_name, expiry_date)",
      )
      .eq("booking_id", id)
      .is("deleted_at", null)
      .order("uploaded_at"),
    db
      .from("booking_events")
      .select("id, event_type, old_value, new_value, actor, created_at")
      .eq("booking_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("booking_change_requests")
      .select("*")
      .eq("booking_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("conversations")
      .select("id")
      .eq("customer_id", b.customer_id)
      .maybeSingle(),
    db
      .from("vehicles")
      .select("id, make, model, registration")
      .eq("status", "ACTIVE")
      .order("make"),
  ]);

  const c = b.customers as {
    id: string;
    full_name: string | null;
    whatsapp_number: string;
    customer_code: string;
  } | null;
  const v = b.vehicles as {
    id: string;
    make: string;
    model: string;
    registration: string;
    vehicle_code: string;
  } | null;
  const next = [...(ALLOWED_TRANSITIONS.get(b.status as BookingStatus) ?? [])];
  const canDocs = can(staff, "view_documents");

  return (
    <>
      <Link href="/dashboard/bookings" className="text-sm underline">
        ← Bookings
      </Link>
      <h1 className="my-3 text-xl font-semibold">
        Booking #{b.booking_number} <Badge value={b.status} />
      </h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Card title="Rental">
            <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
              <dt className="text-zinc-500">Customer</dt>
              <dd>
                {c && (
                  <Link
                    className="underline"
                    href={`/dashboard/customers/${c.id}`}
                  >
                    {c.full_name ?? c.whatsapp_number}
                  </Link>
                )}{" "}
                ({c?.whatsapp_number})
              </dd>
              <dt className="text-zinc-500">Vehicle</dt>
              <dd>
                {v
                  ? `${v.make} ${v.model} · ${v.registration}`
                  : "Not assigned"}
              </dd>
              <dt className="text-zinc-500">Dates</dt>
              <dd>
                {fmtDateTime(b.pickup_at)} → {fmtDateTime(b.return_at)} (
                {b.rental_days ?? "?"} days)
              </dd>
              <dt className="text-zinc-500">Pickup</dt>
              <dd>{(b.pickup as { name: string } | null)?.name ?? "—"}</dd>
              <dt className="text-zinc-500">Drop-off</dt>
              <dd>{(b.dropoff as { name: string } | null)?.name ?? "—"}</dd>
            </dl>
            <h3 className="mt-3 text-sm font-medium">Price</h3>
            <dl className="grid grid-cols-[1fr_auto] gap-y-0.5 text-sm">
              <dt>
                {b.rental_days ?? "?"} days × Rs {b.daily_price_rs ?? "?"}
              </dt>
              <dd>Rs {(b.rental_days ?? 0) * (b.daily_price_rs ?? 0)}</dd>
              {b.extras_rs > 0 && (
                <>
                  <dt>Extras</dt>
                  <dd>Rs {b.extras_rs}</dd>
                </>
              )}
              <dt className="font-semibold">Total (incl. location fees)</dt>
              <dd className="font-semibold">Rs {b.total_rs ?? "—"}</dd>
            </dl>
          </Card>

          <Card title="Payment (cash)">
            <div className="mb-2">
              <Badge value={b.payment_status} />
            </div>
            {b.payment_status !== "PAID" && can(staff, "mark_paid") && (
              <form action={A.payAction}>
                <input type="hidden" name="id" value={id} />
                <ConfirmButton
                  className={btnPrimary}
                  message={`Confirm Rs ${b.total_rs ?? 0} was received in cash?`}
                >
                  Mark as Paid
                </ConfirmButton>
              </form>
            )}
            {b.payment_status === "PAID" && can(staff, "undo_payment") && (
              <form action={A.undoPayAction} className="flex gap-2">
                <input type="hidden" name="id" value={id} />
                <input
                  name="reason"
                  required
                  placeholder="Reason for undoing"
                  className={input}
                />
                <ConfirmButton className={btn} message="Undo this payment?">
                  Undo
                </ConfirmButton>
              </form>
            )}
          </Card>

          <Card title="Status">
            <div className="flex flex-wrap gap-2">
              {next.map((s) => (
                <form key={s} action={A.setStatusAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="to" value={s} />
                  <ConfirmButton
                    className={btn}
                    message={`Change status to ${s}?`}
                  >
                    {s.replace(/_/g, " ")}
                  </ConfirmButton>
                </form>
              ))}
              {next.length === 0 && (
                <span className="text-sm text-zinc-500">
                  No further transitions.
                </span>
              )}
            </div>
          </Card>

          {can(staff, "fleet") && (
            <Card title="Reassign vehicle">
              <form action={A.reassignAction} className="flex gap-2">
                <input type="hidden" name="id" value={id} />
                <select
                  name="vehicleId"
                  defaultValue={b.vehicle_id ?? ""}
                  className={input}
                >
                  {(vehicles ?? []).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.make} {x.model} · {x.registration}
                    </option>
                  ))}
                </select>
                <ConfirmButton
                  className={btn}
                  message="Reassign this booking? The engine will refuse if there's a conflict."
                >
                  Reassign
                </ConfirmButton>
              </form>
            </Card>
          )}

          <Card title="Notes">
            <form action={A.saveNotesAction} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={id} />
              <textarea
                name="notes"
                defaultValue={b.notes ?? ""}
                rows={3}
                className={input}
              />
              <button className={btn}>Save notes</button>
            </form>
          </Card>
        </div>

        <div>
          <Card title="Documents">
            <div className="mb-2">
              <Badge value={b.document_status} />
            </div>
            <ul className="mb-3 text-sm">
              {(docs ?? []).map((d) => {
                const vs = d.document_verifications as unknown as {
                  result: string;
                  reasons: string[];
                  extracted_name: string | null;
                  expiry_date: string | null;
                }[];
                return (
                  <li key={d.id} className="mb-2 rounded border p-2">
                    <div className="flex items-center justify-between">
                      <b>{d.doc_type.replace("_", " ")}</b>
                      {canDocs && (
                        <a
                          className="underline"
                          href={`/dashboard/documents/${d.id}`}
                          target="_blank"
                        >
                          View (60s link, logged)
                        </a>
                      )}
                    </div>
                    {(vs ?? []).map((x, i) => (
                      <div key={i} className="mt-1 text-xs">
                        {x.result === "VERIFIED"
                          ? "✔ verified"
                          : "⚠ needs review"}
                        {x.reasons?.length > 0 && (
                          <ul className="ml-4 list-disc">
                            {x.reasons.map((r) => (
                              <li key={r}>{r}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </li>
                );
              })}
              {(docs ?? []).length === 0 && (
                <li className="text-zinc-500">Nothing uploaded yet.</li>
              )}
            </ul>
            {canDocs && (
              <div className="flex flex-wrap gap-2">
                <form action={A.approveDocsAction}>
                  <input type="hidden" name="id" value={id} />
                  <ConfirmButton
                    className={btnPrimary}
                    message="Approve documents and tell the customer?"
                  >
                    Approve
                  </ConfirmButton>
                </form>
                <form action={A.reuploadAction}>
                  <input type="hidden" name="id" value={id} />
                  <ConfirmButton
                    className={btn}
                    message="Send a new upload link to the customer?"
                  >
                    Request re-upload
                  </ConfirmButton>
                </form>
              </div>
            )}
            {can(staff, "reject_documents") && (
              <form action={A.rejectDocsAction} className="mt-2 flex gap-2">
                <input type="hidden" name="id" value={id} />
                <input
                  name="reason"
                  required
                  placeholder="Reason (required)"
                  className={input}
                />
                <ConfirmButton
                  className={btn}
                  message="Reject documents? The booking moves to NEEDS_HUMAN."
                >
                  Reject
                </ConfirmButton>
              </form>
            )}
          </Card>

          {(requests ?? []).length > 0 && (
            <Card title="Change requests">
              {(requests ?? []).map((r) => (
                <div key={r.id} className="mb-3 rounded border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <b>{r.type.replace(/_/g, " ")}</b>
                    <Badge value={r.status} />
                  </div>
                  <div className="text-xs text-zinc-600">
                    Current: {fmtDateTime(r.current_values?.returnAt)} ·
                    Requested:{" "}
                    {fmtDateTime(
                      r.requested_values?.newReturnAt ??
                        r.requested_values?.newPickupAt,
                    )}
                  </div>
                  <div>Additional: Rs {r.quoted_additional_rs}</div>
                  {!r.availability_ok && (
                    <div className="text-red-700">⚠ {r.conflict_note}</div>
                  )}
                  {r.status === "PENDING" && can(staff, "approve_requests") && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <form action={A.approveRequestAction}>
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="requestId" value={r.id} />
                        <ConfirmButton
                          className={btnPrimary}
                          message="Approve and apply this change?"
                        >
                          Approve
                        </ConfirmButton>
                      </form>
                      <form
                        action={A.declineRequestAction}
                        className="flex gap-1"
                      >
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="requestId" value={r.id} />
                        <input
                          name="reason"
                          placeholder="Reason (optional)"
                          className="rounded border p-1 text-xs"
                        />
                        <button className={btn}>Decline</button>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}

          <Card title="History">
            <ul className="text-xs">
              {(events ?? []).map((e) => (
                <li key={e.id} className="border-b py-1">
                  <span className="text-zinc-500">
                    {fmtDateTime(e.created_at)}
                  </span>{" "}
                  · {e.actor} · {e.event_type}
                  {e.new_value && ` → ${e.new_value}`}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {conv && (
        <Card title="Conversation">
          <ConversationPanel conversationId={conv.id} staff={staff} />
        </Card>
      )}
    </>
  );
}
