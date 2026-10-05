import { requireStaff } from "@/lib/dashboard/auth";
import { loadAnalyticsInput } from "@/lib/analytics/load";
import {
  computeMetrics,
  previousPeriod,
  thisMonth,
  type Period,
} from "@/lib/analytics/metrics";
import { Card, Stat, btn, input } from "../../_components/ui";

export const dynamic = "force-dynamic";

function Bars({
  rows,
  fmt,
}: {
  rows: { name: string; value: number }[];
  fmt: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="text-sm">
      {rows.map((r) => (
        <li
          key={r.name}
          className="mb-1 grid grid-cols-[140px_1fr_70px] items-center gap-2"
        >
          <span className="truncate">{r.name}</span>
          <span className="h-3 rounded bg-zinc-100">
            <span
              className="block h-3 rounded bg-blue-500"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className="text-right">{fmt(r.value)}</span>
        </li>
      ))}
      {rows.length === 0 && <li className="text-zinc-500">No data</li>}
    </ul>
  );
}

const delta = (cur: number, prev: number) =>
  prev === 0
    ? cur === 0
      ? "—"
      : "new"
    : `${cur >= prev ? "+" : ""}${Math.round(((cur - prev) / prev) * 100)}% vs prev.`;

export default async function Analytics({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireStaff("analytics");
  const q = await searchParams;
  const def = thisMonth(new Date());
  const period: Period =
    q.from && q.to
      ? {
          start: new Date(`${q.from}T00:00:00+04:00`),
          end: new Date(
            new Date(`${q.to}T00:00:00+04:00`).getTime() + 86400_000,
          ),
        }
      : def;
  const data = await loadAnalyticsInput();
  const cur = computeMetrics(data, period);
  const prev = computeMetrics(data, previousPeriod(period));
  const fromKey = period.start.toLocaleDateString("en-CA", {
    timeZone: "Indian/Mauritius",
  });
  const toKey = new Date(period.end.getTime() - 1).toLocaleDateString("en-CA", {
    timeZone: "Indian/Mauritius",
  });
  const qs = `from=${fromKey}&to=${toKey}`;
  const pct = (n: number | null) =>
    n === null ? "—" : `${Math.round(n * 100)}%`;

  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Analytics</h1>
      <form className="mb-4 flex flex-wrap gap-2">
        <input
          type="date"
          name="from"
          defaultValue={fromKey}
          className={`${input} !w-auto`}
        />
        <input
          type="date"
          name="to"
          defaultValue={toKey}
          className={`${input} !w-auto`}
        />
        <button className={btn}>Apply</button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat
          label={`Created · ${delta(cur.bookings.created, prev.bookings.created)}`}
          value={cur.bookings.created}
        />
        <Stat
          label={`Confirmed · ${delta(cur.bookings.confirmed, prev.bookings.confirmed)}`}
          value={cur.bookings.confirmed}
        />
        <Stat
          label={`Completed · ${delta(cur.bookings.completed, prev.bookings.completed)}`}
          value={cur.bookings.completed}
        />
        <Stat label="Cancelled" value={cur.bookings.cancelled} />
        <Stat label="Active now" value={cur.bookings.active} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Conversion funnel">
          <Bars
            fmt={String}
            rows={[
              { name: "WhatsApp enquiries", value: cur.funnel.enquiries },
              { name: "Booking drafts", value: cur.funnel.drafts },
              { name: "Confirmed", value: cur.funnel.confirmed },
              { name: "Completed", value: cur.funnel.completed },
            ]}
          />
        </Card>
        <Card title="Revenue (Rs)">
          <p className="text-sm">
            Gross: <b>{cur.revenue.grossRs}</b> (
            {delta(cur.revenue.grossRs, prev.revenue.grossRs)}) · Cash
            collected: <b>{cur.revenue.cashCollectedRs}</b> · Outstanding:{" "}
            <b>{cur.revenue.outstandingRs}</b>
          </p>
          <h3 className="mt-2 text-xs text-zinc-500">By model</h3>
          <Bars
            fmt={String}
            rows={cur.revenue.byModel.map((r) => ({
              name: r.name,
              value: r.rs,
            }))}
          />
          <h3 className="mt-2 text-xs text-zinc-500">By pickup location</h3>
          <Bars
            fmt={String}
            rows={cur.revenue.byLocation.map((r) => ({
              name: r.name,
              value: r.rs,
            }))}
          />
        </Card>
        <Card title="Fleet utilisation">
          <h3 className="text-xs text-zinc-500">Per model</h3>
          <Bars
            fmt={(n) => `${Math.round(n * 100)}%`}
            rows={cur.utilisation.perModel.map((r) => ({
              name: r.name,
              value: r.pct,
            }))}
          />
          <h3 className="mt-2 text-xs text-zinc-500">Per vehicle</h3>
          <Bars
            fmt={(n) => `${Math.round(n * 100)}%`}
            rows={cur.utilisation.perVehicle.map((r) => ({
              name: r.name,
              value: r.pct,
            }))}
          />
        </Card>
        <Card title="Locations">
          <h3 className="text-xs text-zinc-500">Pickups</h3>
          <Bars
            fmt={String}
            rows={cur.locations.pickups.map((r) => ({
              name: r.name,
              value: r.count,
            }))}
          />
          <h3 className="mt-2 text-xs text-zinc-500">Drop-offs</h3>
          <Bars
            fmt={String}
            rows={cur.locations.dropoffs.map((r) => ({
              name: r.name,
              value: r.count,
            }))}
          />
        </Card>
        <Card title="Operations">
          <ul className="text-sm leading-6">
            <li>
              Completed without human intervention:{" "}
              <b>{pct(cur.operations.pctCompletedWithoutHuman)}</b>
            </li>
            <li>
              AI-handled conversations:{" "}
              <b>{cur.operations.aiHandledConversations}</b> · human-handled:{" "}
              <b>{cur.operations.humanHandledConversations}</b>
            </li>
            <li>
              Avg time to document verification:{" "}
              <b>
                {cur.operations.avgHoursToDocVerification === null
                  ? "—"
                  : `${cur.operations.avgHoursToDocVerification.toFixed(1)} h`}
              </b>
            </li>
            <li>
              Delays: <b>{cur.operations.delays}</b> · Extensions:{" "}
              <b>{cur.operations.extensions}</b>
            </li>
          </ul>
        </Card>
        <Card title="Export CSV">
          <div className="flex flex-wrap gap-2 text-sm">
            {[
              "bookings",
              "revenue_by_model",
              "revenue_by_location",
              "utilisation",
              "locations",
            ].map((t) => (
              <a
                key={t}
                className={btn}
                href={`/dashboard/analytics/export?table=${t}&${qs}`}
              >
                {t}
              </a>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
