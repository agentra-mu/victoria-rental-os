import Link from "next/link";
import { requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  barColumns,
  dayKeys,
  localMidnight,
  utilisation,
} from "@/lib/calendar/layout";
import { localDateKey } from "../../_components/ui";
import CalendarGrid, { type CalRow } from "../../_components/CalendarGrid";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; start?: string }>;
}) {
  await requireStaff("bookings");
  const q = await searchParams;
  const days = q.view === "month" ? 31 : 7;
  const todayKey = localDateKey(new Date());
  const startKey = q.start ?? todayKey;
  const keys = dayKeys(startKey, days);
  const rangeStart = localMidnight(startKey);
  const rangeEnd = new Date(rangeStart.getTime() + days * 86400_000);

  const db = getServiceSupabase();
  const [{ data: vehicles }, { data: bookings }, { data: maint }] =
    await Promise.all([
      db
        .from("vehicles")
        .select("id, vehicle_code, make, model")
        .eq("status", "ACTIVE")
        .order("vehicle_code"),
      db
        .from("bookings")
        .select(
          "id, booking_number, status, vehicle_id, pickup_at, return_at, customers(full_name)",
        )
        .not("status", "in", "(CANCELLED,ENQUIRY)")
        .not("vehicle_id", "is", null)
        .lt("pickup_at", rangeEnd.toISOString())
        .gt("return_at", rangeStart.toISOString()),
      db
        .from("vehicle_maintenance")
        .select("id, vehicle_id, start_at, end_at, reason")
        .lt("start_at", rangeEnd.toISOString())
        .gt("end_at", rangeStart.toISOString()),
    ]);

  const rows: CalRow[] = (vehicles ?? []).map((v) => {
    const vb = (bookings ?? []).filter((b) => b.vehicle_id === v.id);
    const bars: CalRow["bars"] = [];
    for (const b of vb) {
      const c = barColumns(
        { startAt: b.pickup_at!, endAt: b.return_at! },
        startKey,
        days,
      );
      if (c)
        bars.push({
          id: b.id,
          bookingNumber: b.booking_number,
          status: b.status,
          label:
            (b.customers as unknown as { full_name: string | null } | null)
              ?.full_name ?? "",
          start: c.start,
          end: c.end,
          kind: "booking",
        });
    }
    for (const m of (maint ?? []).filter((m) => m.vehicle_id === v.id)) {
      const c = barColumns(
        { startAt: m.start_at, endAt: m.end_at },
        startKey,
        days,
      );
      if (c)
        bars.push({
          id: m.id,
          label: m.reason ?? "Maintenance",
          start: c.start,
          end: c.end,
          kind: "maintenance",
        });
    }
    return {
      vehicleId: v.id,
      name: `${v.vehicle_code} ${v.make} ${v.model}`,
      utilisation: utilisation(
        vb.map((b) => ({ startAt: b.pickup_at!, endAt: b.return_at! })),
        startKey,
        days,
      ),
      bars,
    };
  });

  const shift = (n: number) =>
    new Date(rangeStart.getTime() + n * 86400_000 + 4 * 3600_000)
      .toISOString()
      .slice(0, 10);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Fleet calendar</h1>
        <Link
          className="rounded border bg-white px-2 py-1 text-sm"
          href={`?view=week&start=${startKey}`}
        >
          Week
        </Link>
        <Link
          className="rounded border bg-white px-2 py-1 text-sm"
          href={`?view=month&start=${startKey}`}
        >
          Month
        </Link>
        <Link
          className="rounded border bg-white px-2 py-1 text-sm"
          href={`?view=${q.view ?? "week"}&start=${shift(-days)}`}
        >
          ←
        </Link>
        <Link
          className="rounded border bg-white px-2 py-1 text-sm"
          href={`?view=${q.view ?? "week"}`}
        >
          Today
        </Link>
        <Link
          className="rounded border bg-white px-2 py-1 text-sm"
          href={`?view=${q.view ?? "week"}&start=${shift(days)}`}
        >
          →
        </Link>
        <span className="text-xs text-zinc-500">
          Drag a booking bar onto another vehicle to reassign. Hatched =
          maintenance.
        </span>
      </div>
      <CalendarGrid
        days={keys.map((k) => ({ key: k, label: k.slice(8) }))}
        todayIndex={keys.indexOf(todayKey)}
        rows={rows}
      />
    </>
  );
}
