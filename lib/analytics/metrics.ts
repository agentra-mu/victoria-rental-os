/** Pure analytics over raw rows — see /dashboard/analytics. Unit-tested with known expected values. */

const DAY = 86400_000;
const REVENUE_STATUSES = new Set([
  "CONFIRMED",
  "PICKED_UP",
  "RETURNED",
  "COMPLETED",
]);
const REACHED_CONFIRMED = new Set([
  "PENDING_DOCUMENTS",
  "DOCUMENTS_VERIFIED",
  "CONFIRMED",
  "PICKED_UP",
  "RETURNED",
  "COMPLETED",
]);

export interface BookingRow {
  id: string;
  customer_id: string;
  status: string;
  payment_status: string;
  created_at: string;
  pickup_at: string | null;
  return_at: string | null;
  total_rs: number | null;
  vehicle_id: string | null;
  pickup_location_id: string | null;
  dropoff_location_id: string | null;
}
export interface PaymentRow {
  booking_id: string;
  amount_rs: number;
  marked_paid_at: string;
}
export interface EventRow {
  booking_id: string;
  event_type: string;
  new_value: string | null;
  created_at: string;
}
export interface ConversationRow {
  customer_id: string;
  mode: string;
  taken_over_at: string | null;
}
export interface VehicleRow {
  id: string;
  make: string;
  model: string;
}
export interface MaintenanceRow {
  vehicle_id: string;
  start_at: string;
  end_at: string;
}
export interface LocationRow {
  id: string;
  name: string;
}
export interface ChangeRequestRow {
  type: string;
  created_at: string;
}
export interface CustomerRow {
  created_at: string;
}

export interface AnalyticsInput {
  bookings: BookingRow[];
  payments: PaymentRow[];
  events: EventRow[];
  conversations: ConversationRow[];
  vehicles: VehicleRow[];
  maintenance: MaintenanceRow[];
  locations: LocationRow[];
  changeRequests: ChangeRequestRow[];
  customers: CustomerRow[];
}

export interface Period {
  start: Date;
  end: Date;
}

const inPeriod = (iso: string | null, p: Period) =>
  !!iso &&
  Date.parse(iso) >= p.start.getTime() &&
  Date.parse(iso) < p.end.getTime();

function overlapDays(startIso: string, endIso: string, p: Period): number {
  const s = Math.max(Date.parse(startIso), p.start.getTime());
  const e = Math.min(Date.parse(endIso), p.end.getTime());
  return e > s ? (e - s) / DAY : 0;
}

export interface Metrics {
  bookings: {
    created: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    active: number;
  };
  funnel: {
    enquiries: number;
    drafts: number;
    confirmed: number;
    completed: number;
  };
  revenue: {
    grossRs: number;
    cashCollectedRs: number;
    outstandingRs: number;
    byModel: { name: string; rs: number }[];
    byLocation: { name: string; rs: number }[];
  };
  utilisation: {
    perVehicle: { id: string; name: string; pct: number }[];
    perModel: { name: string; pct: number }[];
  };
  locations: {
    pickups: { name: string; count: number }[];
    dropoffs: { name: string; count: number }[];
  };
  operations: {
    aiHandledConversations: number;
    humanHandledConversations: number;
    pctCompletedWithoutHuman: number | null;
    avgHoursToDocVerification: number | null;
    delays: number;
    extensions: number;
  };
}

function tally(names: (string | null)[], lookup: Map<string, string>) {
  const m = new Map<string, number>();
  for (const n of names) {
    const label = n ? (lookup.get(n) ?? "Unknown") : "Unassigned";
    m.set(label, (m.get(label) ?? 0) + 1);
  }
  return [...m]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function computeMetrics(data: AnalyticsInput, p: Period): Metrics {
  const vehicleName = new Map(
    data.vehicles.map((v) => [v.id, `${v.make} ${v.model}`]),
  );
  const locName = new Map(data.locations.map((l) => [l.id, l.name]));
  const createdInPeriod = data.bookings.filter((b) =>
    inPeriod(b.created_at, p),
  );

  const reached = new Set(
    data.events
      .filter(
        (e) =>
          e.event_type === "STATUS_CHANGED" &&
          e.new_value &&
          REACHED_CONFIRMED.has(e.new_value),
      )
      .map((e) => e.booking_id),
  );
  const confirmedIds = new Set(
    createdInPeriod
      .filter((b) => reached.has(b.id) || REACHED_CONFIRMED.has(b.status))
      .map((b) => b.id),
  );
  const completed = createdInPeriod.filter(
    (b) => b.status === "COMPLETED" || b.status === "RETURNED",
  );

  const bookings = {
    created: createdInPeriod.length,
    confirmed: confirmedIds.size,
    completed: completed.length,
    cancelled: createdInPeriod.filter((b) => b.status === "CANCELLED").length,
    active: data.bookings.filter(
      (b) =>
        !["CANCELLED", "COMPLETED", "RETURNED", "ENQUIRY"].includes(b.status),
    ).length,
  };

  const funnel = {
    enquiries: data.customers.filter((c) => inPeriod(c.created_at, p)).length,
    drafts: createdInPeriod.length,
    confirmed: confirmedIds.size,
    completed: completed.length,
  };

  const gross = createdInPeriod.filter((b) => REVENUE_STATUSES.has(b.status));
  const byModelMap = new Map<string, number>();
  const byLocMap = new Map<string, number>();
  for (const b of gross) {
    const m = b.vehicle_id
      ? (vehicleName.get(b.vehicle_id) ?? "Unknown")
      : "Unassigned";
    byModelMap.set(m, (byModelMap.get(m) ?? 0) + (b.total_rs ?? 0));
    const l = b.pickup_location_id
      ? (locName.get(b.pickup_location_id) ?? "Unknown")
      : "Unassigned";
    byLocMap.set(l, (byLocMap.get(l) ?? 0) + (b.total_rs ?? 0));
  }
  const toList = (m: Map<string, number>) =>
    [...m].map(([name, rs]) => ({ name, rs })).sort((a, b) => b.rs - a.rs);
  const revenue = {
    grossRs: gross.reduce((s, b) => s + (b.total_rs ?? 0), 0),
    cashCollectedRs: data.payments
      .filter((x) => inPeriod(x.marked_paid_at, p))
      .reduce((s, x) => s + x.amount_rs, 0),
    outstandingRs: gross
      .filter((b) => b.payment_status !== "PAID")
      .reduce((s, b) => s + (b.total_rs ?? 0), 0),
    byModel: toList(byModelMap),
    byLocation: toList(byLocMap),
  };

  const periodDays = (p.end.getTime() - p.start.getTime()) / DAY;
  const perVehicle = data.vehicles.map((v) => {
    const booked = data.bookings
      .filter(
        (b) =>
          b.vehicle_id === v.id &&
          !["CANCELLED", "ENQUIRY"].includes(b.status) &&
          b.pickup_at &&
          b.return_at,
      )
      .reduce((s, b) => s + overlapDays(b.pickup_at!, b.return_at!, p), 0);
    const maint = data.maintenance
      .filter((m) => m.vehicle_id === v.id)
      .reduce((s, m) => s + overlapDays(m.start_at, m.end_at, p), 0);
    const available = Math.max(0, periodDays - maint);
    return {
      id: v.id,
      name: `${v.make} ${v.model}`,
      booked,
      available,
      pct: available > 0 ? Math.min(1, booked / available) : 0,
    };
  });
  const modelAgg = new Map<string, { booked: number; available: number }>();
  for (const v of perVehicle) {
    const a = modelAgg.get(v.name) ?? { booked: 0, available: 0 };
    a.booked += v.booked;
    a.available += v.available;
    modelAgg.set(v.name, a);
  }
  const utilisation = {
    perVehicle: perVehicle.map((v) => ({ id: v.id, name: v.name, pct: v.pct })),
    perModel: [...modelAgg].map(([name, a]) => ({
      name,
      pct: a.available > 0 ? Math.min(1, a.booked / a.available) : 0,
    })),
  };

  const locations = {
    pickups: tally(
      createdInPeriod.map((b) => b.pickup_location_id),
      locName,
    ),
    dropoffs: tally(
      createdInPeriod.map((b) => b.dropoff_location_id),
      locName,
    ),
  };

  const humanCustomers = new Set(
    data.conversations.filter((c) => c.taken_over_at).map((c) => c.customer_id),
  );
  const humanTouched = (b: BookingRow) =>
    humanCustomers.has(b.customer_id) || b.status === "NEEDS_HUMAN";
  const hours: number[] = [];
  for (const b of createdInPeriod) {
    const evs = data.events.filter((e) => e.booking_id === b.id);
    const start = evs.find(
      (e) =>
        e.event_type === "STATUS_CHANGED" &&
        e.new_value === "PENDING_DOCUMENTS",
    );
    const done = evs.find(
      (e) =>
        e.event_type === "DOCUMENT_STATUS_CHANGED" &&
        e.new_value === "VERIFIED",
    );
    if (start && done)
      hours.push(
        (Date.parse(done.created_at) - Date.parse(start.created_at)) / 3600_000,
      );
  }
  const reqs = data.changeRequests.filter((r) => inPeriod(r.created_at, p));
  const operations = {
    aiHandledConversations: data.conversations.filter((c) => !c.taken_over_at)
      .length,
    humanHandledConversations: humanCustomers.size,
    pctCompletedWithoutHuman: completed.length
      ? completed.filter((b) => !humanTouched(b)).length / completed.length
      : null,
    avgHoursToDocVerification: hours.length
      ? hours.reduce((a, b) => a + b, 0) / hours.length
      : null,
    delays: reqs.filter((r) => r.type === "RETURN_DELAY").length,
    extensions: reqs.filter((r) => r.type === "EXTENSION").length,
  };

  return { bookings, funnel, revenue, utilisation, locations, operations };
}

export function thisMonth(now: Date): Period {
  const key = now
    .toLocaleDateString("en-CA", { timeZone: "Indian/Mauritius" })
    .slice(0, 7);
  const start = new Date(`${key}-01T00:00:00+04:00`);
  const [y, m] = key.split("-").map(Number);
  const next =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start, end: new Date(`${next}-01T00:00:00+04:00`) };
}

export function previousPeriod(p: Period): Period {
  const len = p.end.getTime() - p.start.getTime();
  return { start: new Date(p.start.getTime() - len), end: p.start };
}

export function toCsv(rows: Record<string, string | number | null>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => esc(r[c])).join(",")),
  ].join("\n");
}
