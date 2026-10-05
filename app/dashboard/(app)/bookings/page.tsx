import Link from "next/link";
import { requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { BOOKING_STATUSES } from "@/lib/domain/bookingStatus";
import { Badge, btn, fmtDateTime, input } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff("bookings");
  const q = await searchParams;
  const db = getServiceSupabase();
  let query = db
    .from("bookings")
    .select(
      "id, booking_number, status, payment_status, document_status, pickup_at, return_at, total_rs, customers!inner(full_name, whatsapp_number), vehicles(make, model)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (q.status) query = query.eq("status", q.status);
  if (q.payment) query = query.eq("payment_status", q.payment);
  if (q.docs) query = query.eq("document_status", q.docs);
  if (q.from) query = query.gte("pickup_at", `${q.from}T00:00:00+04:00`);
  if (q.to) query = query.lte("pickup_at", `${q.to}T23:59:59+04:00`);
  const term = q.q?.trim();
  if (term) {
    if (/^#?\d+$/.test(term))
      query = query.eq("booking_number", Number(term.replace("#", "")));
    else
      query = query.or(
        `full_name.ilike.%${term}%,whatsapp_number.ilike.%${term}%`,
        { referencedTable: "customers" },
      );
  }
  const { data } = await query;
  type R = {
    id: string;
    booking_number: number;
    status: string;
    payment_status: string;
    document_status: string;
    pickup_at: string | null;
    return_at: string | null;
    total_rs: number | null;
    customers: { full_name: string | null; whatsapp_number: string };
    vehicles: { make: string; model: string } | null;
  };
  const rows = (data ?? []) as unknown as R[];

  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Bookings</h1>
      <form className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <input
          name="q"
          defaultValue={q.q}
          placeholder="Name, phone or #"
          className={input}
        />
        <select name="status" defaultValue={q.status ?? ""} className={input}>
          <option value="">Any status</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select name="payment" defaultValue={q.payment ?? ""} className={input}>
          <option value="">Any payment</option>
          <option>UNPAID</option>
          <option>PAID</option>
        </select>
        <select name="docs" defaultValue={q.docs ?? ""} className={input}>
          <option value="">Any documents</option>
          {[
            "NOT_SUBMITTED",
            "PENDING",
            "NEEDS_REVIEW",
            "VERIFIED",
            "REJECTED",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={q.from}
          className={input}
        />
        <input type="date" name="to" defaultValue={q.to} className={input} />
        <button className={btn}>Filter</button>
      </form>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="p-2">#</th>
              <th>Customer</th>
              <th>Car</th>
              <th>Dates</th>
              <th>Total</th>
              <th>Status</th>
              <th>Pay</th>
              <th>Docs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t hover:bg-zinc-50">
                <td className="p-2">
                  <Link
                    className="underline"
                    href={`/dashboard/bookings/${b.id}`}
                  >
                    #{b.booking_number}
                  </Link>
                </td>
                <td>{b.customers.full_name ?? b.customers.whatsapp_number}</td>
                <td>
                  {b.vehicles ? `${b.vehicles.make} ${b.vehicles.model}` : "—"}
                </td>
                <td className="whitespace-nowrap">
                  {fmtDateTime(b.pickup_at)} → {fmtDateTime(b.return_at)}
                </td>
                <td>{b.total_rs != null ? `Rs ${b.total_rs}` : "—"}</td>
                <td>
                  <Badge value={b.status} />
                </td>
                <td>
                  <Badge value={b.payment_status} />
                </td>
                <td>
                  <Badge value={b.document_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-4 text-sm text-zinc-500">No bookings match.</p>
        )}
      </div>
    </>
  );
}
