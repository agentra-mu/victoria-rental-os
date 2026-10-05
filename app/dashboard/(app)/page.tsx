import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAction, requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  Stat,
  fmtDateTime,
  localDateKey,
} from "../_components/ui";
import AutoRefresh from "../_components/AutoRefresh";

export const dynamic = "force-dynamic";

type Rel<T> = T | null;
interface Row {
  id: string;
  booking_number: number;
  status: string;
  payment_status: string;
  document_status: string;
  pickup_at: string | null;
  return_at: string | null;
  total_rs: number | null;
  customers: Rel<{ full_name: string | null; whatsapp_number: string }>;
  vehicles: Rel<{ make: string; model: string }>;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  await requireStaff();
  const { denied } = await searchParams;
  const db = getServiceSupabase();
  const now = new Date();
  const dayKey = localDateKey(now);
  const start = new Date(`${dayKey}T00:00:00+04:00`);
  const end = new Date(start.getTime() + 86400_000);

  const [
    { data: notes },
    { data: upcoming },
    { data: vehicles },
    { data: active },
  ] = await Promise.all([
    db
      .from("owner_notifications")
      .select("id, title, body, type, booking_id, created_at")
      .eq("status", "OPEN")
      .order("created_at", { ascending: false }),
    db
      .from("bookings")
      .select(
        "id, booking_number, status, payment_status, document_status, pickup_at, return_at, total_rs, customers(full_name, whatsapp_number), vehicles(make, model)",
      )
      .not("status", "in", "(CANCELLED,COMPLETED,RETURNED,ENQUIRY)")
      .gte("return_at", now.toISOString())
      .order("pickup_at", { ascending: true })
      .limit(30),
    db.from("vehicles").select("id").eq("status", "ACTIVE"),
    db
      .from("bookings")
      .select("vehicle_id, status, pickup_at, return_at")
      .not("status", "in", "(CANCELLED,ENQUIRY,COMPLETED,RETURNED)")
      .lt("pickup_at", now.toISOString())
      .gt("return_at", now.toISOString()),
  ]);

  const rows = (upcoming ?? []) as unknown as Row[];
  const pickupsToday = rows.filter(
    (b) =>
      b.pickup_at &&
      new Date(b.pickup_at) >= start &&
      new Date(b.pickup_at) < end,
  ).length;
  const returnsToday = rows.filter(
    (b) =>
      b.return_at &&
      new Date(b.return_at) >= start &&
      new Date(b.return_at) < end,
  ).length;
  const busy = new Set((active ?? []).map((b) => b.vehicle_id));
  const out = (active ?? []).filter((b) => b.status === "PICKED_UP").length;
  const available = (vehicles ?? []).filter((v) => !busy.has(v.id)).length;

  async function resolve(formData: FormData) {
    "use server";
    const staff = await requireAction("bookings");
    await getServiceSupabase()
      .from("owner_notifications")
      .update({
        status: "RESOLVED",
        resolved_by: staff.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", String(formData.get("id")));
    revalidatePath("/dashboard");
  }

  return (
    <>
      <AutoRefresh seconds={15} />
      {denied && (
        <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">
          You don&apos;t have permission for that page.
        </p>
      )}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Today's pickups" value={pickupsToday} />
        <Stat label="Today's returns" value={returnsToday} />
        <Stat label="Upcoming bookings" value={rows.length} />
        <Stat label="Cars available now" value={available} />
        <Stat label="Cars out" value={out} />
      </div>

      <Card title={`Needs attention (${notes?.length ?? 0})`}>
        <ul className="flex flex-col gap-2">
          {(notes ?? []).map((n) => (
            <li key={n.id} className="rounded border p-3">
              <div className="flex items-center gap-2">
                <Badge value={n.type} />
                <span className="font-medium">{n.title}</span>
              </div>
              {n.body && (
                <div className="mt-1 text-sm text-zinc-600">{n.body}</div>
              )}
              <div className="mt-2 flex gap-3 text-sm">
                {n.booking_id && (
                  <Link
                    className="underline"
                    href={`/dashboard/bookings/${n.booking_id}`}
                  >
                    Open booking
                  </Link>
                )}
                <form action={resolve}>
                  <input type="hidden" name="id" value={n.id} />
                  <button className="underline">Resolve</button>
                </form>
              </div>
            </li>
          ))}
          {(notes ?? []).length === 0 && (
            <li className="text-sm text-zinc-500">Nothing needs attention.</li>
          )}
        </ul>
      </Card>

      <Card title="Upcoming bookings">
        <ul className="flex flex-col gap-2">
          {rows.map((b) => (
            <li key={b.id}>
              <Link
                href={`/dashboard/bookings/${b.id}`}
                className="block rounded border p-3 hover:bg-zinc-50"
              >
                <div className="font-medium">
                  #{b.booking_number} ·{" "}
                  {b.customers?.full_name ?? b.customers?.whatsapp_number}
                </div>
                <div className="text-sm text-zinc-600">
                  {b.vehicles
                    ? `${b.vehicles.make} ${b.vehicles.model}`
                    : "No car yet"}{" "}
                  · {fmtDateTime(b.pickup_at)} → {fmtDateTime(b.return_at)}
                  {b.total_rs != null && ` · Rs ${b.total_rs}`}
                </div>
                <div className="mt-1 flex gap-1">
                  <Badge value={b.status} />
                  <Badge value={b.payment_status} />
                  <Badge value={`DOCS ${b.document_status}`} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
