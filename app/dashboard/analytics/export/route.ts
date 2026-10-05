import { NextResponse } from "next/server";
import { audit, getStaff } from "@/lib/dashboard/auth";
import { can } from "@/lib/domain/permissions";
import { loadAnalyticsInput } from "@/lib/analytics/load";
import {
  computeMetrics,
  toCsv,
  thisMonth,
  type Period,
} from "@/lib/analytics/metrics";

export async function GET(request: Request) {
  const staff = await getStaff();
  if (!staff || !can(staff, "analytics"))
    return new NextResponse("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const table = url.searchParams.get("table") ?? "bookings";
  const from = url.searchParams.get("from"),
    to = url.searchParams.get("to");
  const period: Period =
    from && to
      ? {
          start: new Date(`${from}T00:00:00+04:00`),
          end: new Date(new Date(`${to}T00:00:00+04:00`).getTime() + 86400_000),
        }
      : thisMonth(new Date());
  const data = await loadAnalyticsInput();
  const m = computeMetrics(data, period);
  const rows: Record<string, string | number | null>[] =
    table === "revenue_by_model"
      ? m.revenue.byModel.map((r) => ({ model: r.name, revenue_rs: r.rs }))
      : table === "revenue_by_location"
        ? m.revenue.byLocation.map((r) => ({
            location: r.name,
            revenue_rs: r.rs,
          }))
        : table === "utilisation"
          ? m.utilisation.perVehicle.map((r) => ({
              vehicle: r.name,
              utilisation_pct: Math.round(r.pct * 100),
            }))
          : table === "locations"
            ? [
                ...m.locations.pickups.map((r) => ({
                  kind: "pickup",
                  location: r.name,
                  count: r.count,
                })),
                ...m.locations.dropoffs.map((r) => ({
                  kind: "dropoff",
                  location: r.name,
                  count: r.count,
                })),
              ]
            : data.bookings
                .filter(
                  (b) =>
                    Date.parse(b.created_at) >= period.start.getTime() &&
                    Date.parse(b.created_at) < period.end.getTime(),
                )
                .map((b) => ({
                  id: b.id,
                  status: b.status,
                  payment_status: b.payment_status,
                  created_at: b.created_at,
                  pickup_at: b.pickup_at,
                  return_at: b.return_at,
                  total_rs: b.total_rs,
                }));
  await audit(staff, "analytics.export", "export", table);
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${table}.csv"`,
    },
  });
}
