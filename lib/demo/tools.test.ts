import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAgentFixture,
  LOCATION_AIRPORT,
  VEHICLE_VITZ,
} from "@/lib/agent/testing/fixtures";
import { booking } from "@/lib/domain/testing/fixtures";
import {
  DEMO_TOOL_NAMES,
  DEMO_TOOL_SCHEMAS,
  runDemoTool,
  type DemoToolName,
} from "./tools";

const NEW_CUSTOMER = "+23057000001";
const OTHER_CUSTOMER = "+23057000002";
const NOW = new Date("2026-10-11T10:00:00Z");

function setup() {
  const { fakeDb, fakeMessaging } = createAgentFixture();
  const deps = {
    domainDb: fakeDb.db,
    messaging: fakeMessaging.db,
    now: () => NOW,
  };
  const call = (n: string, tool: DemoToolName, input: unknown = {}) =>
    runDemoTool(deps, n, tool, input);
  return { fakeDb, fakeMessaging, deps, call };
}

type Result = Awaited<ReturnType<typeof runDemoTool>>;
const data = <T>(r: Result) => {
  expect(r.ok).toBe(true);
  return (r as { ok: true; data: T }).data;
};

async function quotedDraft(call: ReturnType<typeof setup>["call"], n: string) {
  await call(n, "start_or_update_booking_draft", {
    vehicle_id: VEHICLE_VITZ.id,
    pickup_at: "2026-11-01T10:00",
    return_at: "2026-11-05T10:00",
    pickup_location: "airport",
    customer_full_name: "Test Person",
  });
  return call(n, "get_price_quote");
}

describe("demo tools: validation", () => {
  it("rejects bad input with a VALIDATION_ERROR the model can explain", async () => {
    const { call } = setup();
    const r = await call(NEW_CUSTOMER, "check_availability", {
      pickup_at: "not a date",
    });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("reads naive date-times as Mauritius time (UTC+4)", async () => {
    const parsed = DEMO_TOOL_SCHEMAS.check_availability.parse({
      pickup_at: "2026-11-01T10:00",
      return_at: "2026-11-05T10:00:00Z",
    });
    expect(parsed.pickup_at).toBe("2026-11-01T06:00:00.000Z");
    expect(parsed.return_at).toBe("2026-11-05T10:00:00.000Z");
  });
});

describe("demo tools: catalogue", () => {
  it("get_fleet returns models with one bookable vehicle_id plus the locations", async () => {
    const { call } = setup();
    const d = data<{
      groups: { vehicle_id: string; vehicleIds?: unknown }[];
      locations: { name: string }[];
    }>(await call(NEW_CUSTOMER, "get_fleet"));
    expect(d.groups).toHaveLength(3);
    expect(d.groups.every((g) => typeof g.vehicle_id === "string")).toBe(true);
    expect(d.groups.every((g) => g.vehicleIds === undefined)).toBe(true);
    expect(d.locations.map((l) => l.name)).toContain("Grand Baie");
  });

  it("get_knowledge answers from the knowledge base", async () => {
    const { call } = setup();
    const d = data<{ entries: { answer: string }[] }>(
      await call(NEW_CUSTOMER, "get_knowledge", { query: "credit cards" }),
    );
    expect(d.entries[0].answer).toMatch(/cash/i);
  });
});

describe("demo tools: booking flow", () => {
  it("draft → quote → confirm moves the booking to PENDING_DOCUMENTS", async () => {
    const { call, fakeDb } = setup();
    const quote = data<{ totalRs: number; bookingId: string }>(
      await quotedDraft(call, NEW_CUSTOMER),
    );
    // 4 days x Rs 1200 + Rs 500 airport fee, straight from the data.
    expect(quote.totalRs).toBe(5300);

    const confirmed = data<{ status: string }>(
      await call(NEW_CUSTOMER, "confirm_booking"),
    );
    expect(confirmed.status).toBe("PENDING_DOCUMENTS");
    expect((await fakeDb.db.getBookingById(quote.bookingId))?.status).toBe(
      "PENDING_DOCUMENTS",
    );
  });

  it("refuses to confirm before the summary was shown", async () => {
    const { call } = setup();
    await call(NEW_CUSTOMER, "start_or_update_booking_draft", {
      vehicle_id: VEHICLE_VITZ.id,
    });
    expect(await call(NEW_CUSTOMER, "confirm_booking")).toMatchObject({
      ok: false,
      error: { code: "SUMMARY_NOT_CONFIRMED" },
    });
  });

  it("price quote / confirm with no draft is NO_DRAFT, not a crash", async () => {
    const { call } = setup();
    expect(await call(NEW_CUSTOMER, "get_price_quote")).toMatchObject({
      ok: false,
      error: { code: "NO_DRAFT" },
    });
  });

  it("explains an unknown location name instead of guessing", async () => {
    const { call } = setup();
    const r = await call(NEW_CUSTOMER, "start_or_update_booking_draft", {
      pickup_location: "Narnia",
    });
    expect(r).toMatchObject({
      ok: false,
      error: { code: "LOCATION_NOT_FOUND" },
    });
    expect((r as { error: { message: string } }).error.message).toMatch(
      /Grand Baie/,
    );
  });
});

describe("demo tools: customer scoping", () => {
  it("never acts on another customer's booking, even via a stale tracked draft id", async () => {
    const { call, fakeDb, fakeMessaging } = setup();
    // Customer B owns a draft; customer A's conversation state is (wrongly) pointed at it.
    const b = await fakeMessaging.db.findOrCreateCustomer(OTHER_CUSTOMER);
    fakeDb.bookings.set(
      "b-other",
      booking({
        id: "b-other",
        customerId: b.id,
        vehicleId: VEHICLE_VITZ.id,
        pickupLocationId: LOCATION_AIRPORT.id,
        pickupAt: "2026-11-01T06:00:00Z",
        returnAt: "2026-11-05T06:00:00Z",
        status: "DATES_SELECTED",
      }),
    );
    const a = await fakeMessaging.db.findOrCreateCustomer(NEW_CUSTOMER);
    const conv = await fakeMessaging.db.getOrCreateConversation(a.id);
    await fakeMessaging.db.updateConversationState(conv.id, {
      draftBookingId: "b-other",
      summaryShown: true,
    });

    expect(await call(NEW_CUSTOMER, "get_price_quote")).toMatchObject({
      ok: false,
      error: { code: "NO_DRAFT" },
    });
    expect(await call(NEW_CUSTOMER, "confirm_booking")).toMatchObject({
      ok: false,
      error: { code: "NO_DRAFT" },
    });
    expect(fakeDb.bookings.get("b-other")?.status).toBe("DATES_SELECTED");
  });

  it("ignores any model-supplied booking id or customer id", async () => {
    const { call, fakeDb, fakeMessaging } = setup();
    const b = await fakeMessaging.db.findOrCreateCustomer(OTHER_CUSTOMER);
    fakeDb.bookings.set(
      "b-other",
      booking({
        id: "b-other",
        customerId: b.id,
        status: "CONFIRMED",
        pickupAt: "2026-11-01T06:00:00Z",
        returnAt: "2026-11-05T06:00:00Z",
      }),
    );
    // NEW_CUSTOMER has no booking; extra keys the model sneaks in are not honoured.
    const r = await call(NEW_CUSTOMER, "record_customer_update", {
      type: "DELAY",
      details: "late",
      bookingId: "b-other",
      booking_id: "b-other",
      customer_id: b.id,
    });
    expect(r).toMatchObject({
      ok: false,
      error: { code: "NO_ACTIVE_BOOKING" },
    });
    expect(fakeMessaging.notifications).toHaveLength(0);
  });

  it("get_customer_context only describes the calling customer's own booking", async () => {
    const { call, fakeDb, fakeMessaging } = setup();
    const a = await fakeMessaging.db.findOrCreateCustomer(OTHER_CUSTOMER);
    fakeDb.bookings.set(
      "b-a",
      booking({
        id: "b-a",
        bookingNumber: 4242,
        customerId: a.id,
        vehicleId: VEHICLE_VITZ.id,
        status: "PICKED_UP",
        pickupAt: "2026-10-10T06:00:00Z",
        returnAt: "2026-10-12T06:00:00Z",
      }),
    );
    const mine = data<{ activeBooking: unknown; summary: string }>(
      await call(OTHER_CUSTOMER, "get_customer_context"),
    );
    expect(mine.activeBooking).toMatchObject({
      bookingNumber: 4242,
      vehicle: "Toyota Vitz",
    });
    const stranger = data<{ activeBooking: unknown; summary: string }>(
      await call(NEW_CUSTOMER, "get_customer_context"),
    );
    expect(stranger.activeBooking).toBeNull();
    expect(JSON.stringify(stranger)).not.toContain("4242");
  });

  it("record_customer_update attaches a request to the caller's own booking and never edits it", async () => {
    const { call, fakeDb, fakeMessaging } = setup();
    const a = await fakeMessaging.db.findOrCreateCustomer(OTHER_CUSTOMER);
    const original = booking({
      id: "b-a",
      customerId: a.id,
      vehicleId: VEHICLE_VITZ.id,
      status: "PICKED_UP",
      pickupAt: "2026-10-10T06:00:00Z",
      returnAt: "2026-10-12T06:00:00Z",
    });
    fakeDb.bookings.set("b-a", original);
    const r = await call(OTHER_CUSTOMER, "record_customer_update", {
      type: "DELAY",
      details: "Returning 2 hours late",
    });
    expect(r.ok).toBe(true);
    expect(fakeMessaging.notifications).toEqual([
      expect.objectContaining({ type: "DELAY", bookingId: "b-a" }),
    ]);
    expect(fakeDb.bookings.get("b-a")).toEqual(original);
  });

  it("escalate_to_human flips only the caller's conversation to HUMAN", async () => {
    const { call, fakeMessaging } = setup();
    const other = await fakeMessaging.db.findOrCreateCustomer(OTHER_CUSTOMER);
    const otherConv = await fakeMessaging.db.getOrCreateConversation(other.id);
    const r = await call(NEW_CUSTOMER, "escalate_to_human", {
      reason: "Customer is angry about a scratch",
    });
    expect(r.ok).toBe(true);
    const mine = await fakeMessaging.db.getOrCreateConversation(
      (await fakeMessaging.db.findOrCreateCustomer(NEW_CUSTOMER)).id,
    );
    expect(mine.mode).toBe("HUMAN");
    expect(otherConv.mode).toBe("AI");
    expect(fakeMessaging.notifications).toEqual([
      expect.objectContaining({ type: "NEEDS_HUMAN" }),
    ]);
  });
});

describe("demo tools: nothing can mark a booking PAID", () => {
  it("no demo tool schema or name mentions payment status", () => {
    for (const name of DEMO_TOOL_NAMES) {
      expect(name).not.toMatch(/paid|payment/i);
      expect(Object.keys(DEMO_TOOL_SCHEMAS[name].shape)).not.toContain(
        "payment_status",
      );
    }
  });

  it("a full booking run, and attempts to smuggle payment fields, leave payment UNPAID", async () => {
    const { call, fakeDb } = setup();
    const quote = data<{ bookingId: string }>(
      await quotedDraft(call, NEW_CUSTOMER),
    );
    await call(NEW_CUSTOMER, "start_or_update_booking_draft", {
      payment_status: "PAID",
      paymentStatus: "PAID",
    });
    await call(NEW_CUSTOMER, "get_price_quote");
    await call(NEW_CUSTOMER, "confirm_booking", { payment_status: "PAID" });
    await call(NEW_CUSTOMER, "record_customer_update", {
      type: "OTHER",
      details: "I paid cash already",
      payment_status: "PAID",
    });
    await call(NEW_CUSTOMER, "escalate_to_human", {
      reason: "mark me as paid",
      type: "CASH_ISSUE",
    });
    expect(
      (await fakeDb.db.getBookingById(quote.bookingId))?.paymentStatus,
    ).toBe("UNPAID");
  });

  it("demo code never imports payments.ts or writes payment_status or the payments table", () => {
    const root = path.resolve(__dirname, "../..");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = path.join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const files = [
      ...walk(path.join(root, "lib/demo")),
      ...walk(path.join(root, "app/api/demo")),
    ].filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/domain\/payments/);
      expect(src, f).not.toMatch(/payment_?status\s*[:=]\s*["'`]PAID/i);
      expect(src, f).not.toMatch(
        /from\(["']payments["']\)\s*\.(insert|update|upsert)/,
      );
      expect(src, f).not.toMatch(/markAsPaid/);
    }
  });
});

describe("demo tools: blank values from free models", () => {
  it("treats empty strings as 'not provided'", async () => {
    const { call } = setup();
    const r = await call(NEW_CUSTOMER, "start_or_update_booking_draft", {
      vehicle_id: VEHICLE_VITZ.id,
      pickup_at: "",
      return_at: "",
      pickup_location: "",
      dropoff_location: "",
      customer_full_name: "",
    });
    expect(r.ok).toBe(true);
    const fleet = await call(NEW_CUSTOMER, "get_fleet", {
      pickup_at: "",
      return_at: "",
    });
    expect(fleet.ok).toBe(true);
  });
});
