import { describe, expect, it } from "vitest";
import { computeMetrics, toCsv, type AnalyticsInput } from "./metrics";

const period = {
  start: new Date("2026-10-01T00:00:00+04:00"),
  end: new Date("2026-11-01T00:00:00+04:00"),
};
const empty: AnalyticsInput = {
  bookings: [],
  payments: [],
  events: [],
  conversations: [],
  vehicles: [],
  maintenance: [],
  locations: [],
  changeRequests: [],
  customers: [],
};

const data: AnalyticsInput = {
  ...empty,
  vehicles: [
    { id: "v1", make: "Toyota", model: "Vitz" },
    { id: "v2", make: "Kia", model: "Picanto" },
  ],
  locations: [
    { id: "L1", name: "Airport" },
    { id: "L2", name: "Grand Baie" },
  ],
  customers: [
    { created_at: "2026-10-02T00:00:00Z" },
    { created_at: "2026-10-03T00:00:00Z" },
    { created_at: "2026-09-02T00:00:00Z" },
  ],
  bookings: [
    {
      id: "b1",
      customer_id: "c1",
      status: "COMPLETED",
      payment_status: "PAID",
      created_at: "2026-10-02T00:00:00Z",
      pickup_at: "2026-10-05T00:00:00+04:00",
      return_at: "2026-10-10T00:00:00+04:00",
      total_rs: 5000,
      vehicle_id: "v1",
      pickup_location_id: "L1",
      dropoff_location_id: "L1",
    },
    {
      id: "b2",
      customer_id: "c2",
      status: "CONFIRMED",
      payment_status: "UNPAID",
      created_at: "2026-10-03T00:00:00Z",
      pickup_at: "2026-10-20T00:00:00+04:00",
      return_at: "2026-10-22T00:00:00+04:00",
      total_rs: 3000,
      vehicle_id: "v2",
      pickup_location_id: "L2",
      dropoff_location_id: "L1",
    },
    {
      id: "b3",
      customer_id: "c3",
      status: "CANCELLED",
      payment_status: "UNPAID",
      created_at: "2026-10-04T00:00:00Z",
      pickup_at: null,
      return_at: null,
      total_rs: null,
      vehicle_id: null,
      pickup_location_id: null,
      dropoff_location_id: null,
    },
  ],
  payments: [
    {
      booking_id: "b1",
      amount_rs: 5000,
      marked_paid_at: "2026-10-10T00:00:00Z",
    },
  ],
  conversations: [
    { customer_id: "c1", mode: "AI", taken_over_at: null },
    { customer_id: "c2", mode: "AI", taken_over_at: "2026-10-04T00:00:00Z" },
  ],
  maintenance: [
    {
      vehicle_id: "v1",
      start_at: "2026-10-11T00:00:00+04:00",
      end_at: "2026-10-16T00:00:00+04:00",
    },
  ],
  events: [
    {
      booking_id: "b1",
      event_type: "STATUS_CHANGED",
      new_value: "PENDING_DOCUMENTS",
      created_at: "2026-10-02T00:00:00Z",
    },
    {
      booking_id: "b1",
      event_type: "DOCUMENT_STATUS_CHANGED",
      new_value: "VERIFIED",
      created_at: "2026-10-02T06:00:00Z",
    },
  ],
  changeRequests: [
    { type: "EXTENSION", created_at: "2026-10-08T00:00:00Z" },
    { type: "RETURN_DELAY", created_at: "2026-10-09T00:00:00Z" },
  ],
};

describe("computeMetrics", () => {
  const m = computeMetrics(data, period);
  it("bookings and funnel", () => {
    expect(m.bookings).toEqual({
      created: 3,
      confirmed: 2,
      completed: 1,
      cancelled: 1,
      active: 1,
    });
    expect(m.funnel).toEqual({
      enquiries: 2,
      drafts: 3,
      confirmed: 2,
      completed: 1,
    });
  });
  it("revenue", () => {
    expect(m.revenue.grossRs).toBe(8000);
    expect(m.revenue.cashCollectedRs).toBe(5000);
    expect(m.revenue.outstandingRs).toBe(3000);
    expect(m.revenue.byModel).toEqual([
      { name: "Toyota Vitz", rs: 5000 },
      { name: "Kia Picanto", rs: 3000 },
    ]);
  });
  it("utilisation excludes maintenance from available days", () => {
    const vitz = m.utilisation.perVehicle.find((v) => v.id === "v1")!;
    expect(vitz.pct).toBeCloseTo(5 / 26, 5); // 5 booked days / (31 − 5 maintenance)
    expect(
      m.utilisation.perVehicle.find((v) => v.id === "v2")!.pct,
    ).toBeCloseTo(2 / 31, 5);
  });
  it("operations: headline metric, verification time, delays/extensions", () => {
    expect(m.operations.pctCompletedWithoutHuman).toBe(1); // b1's customer never taken over
    expect(m.operations.avgHoursToDocVerification).toBe(6);
    expect(m.operations.delays).toBe(1);
    expect(m.operations.extensions).toBe(1);
    expect(m.operations.humanHandledConversations).toBe(1);
  });
  it("locations", () => {
    expect(m.locations.pickups).toContainEqual({ name: "Airport", count: 1 });
    expect(m.locations.dropoffs).toContainEqual({ name: "Airport", count: 2 });
  });
  it("empty data does not divide by zero", () => {
    const e = computeMetrics(empty, period);
    expect(e.operations.pctCompletedWithoutHuman).toBeNull();
  });
});

describe("toCsv", () => {
  it("escapes commas and quotes", () => {
    expect(toCsv([{ a: "x,y", b: 'he said "hi"', c: null }])).toBe(
      'a,b,c\n"x,y","he said ""hi""",',
    );
  });
});
