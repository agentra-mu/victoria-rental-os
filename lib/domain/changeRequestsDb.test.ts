import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testing/fakeSupabase";
import {
  applyChangeRequest,
  createChangeRequest,
  declineChangeRequest,
  vehicleIsFree,
} from "./changeRequestsDb";
import { reassignBooking } from "./reassign";

const D = (s: string) => `2026-10-${s}T10:00:00+04:00`;

function world() {
  return createFakeSupabase({
    vehicles: [
      {
        id: "v1",
        vehicle_code: "CAR-001",
        make: "Toyota",
        model: "Vitz",
        status: "ACTIVE",
        mileage: 0,
        insurance_expiry: null,
        inspection_expiry: null,
      },
      {
        id: "v2",
        vehicle_code: "CAR-002",
        make: "Toyota",
        model: "Vitz",
        status: "ACTIVE",
        mileage: 0,
        insurance_expiry: null,
        inspection_expiry: null,
      },
      {
        id: "v3",
        vehicle_code: "CAR-003",
        make: "Kia",
        model: "Picanto",
        status: "ACTIVE",
        mileage: 0,
        insurance_expiry: "2026-01-01",
        inspection_expiry: null,
      },
    ],
    bookings: [
      {
        id: "b1",
        booking_number: 1001,
        customer_id: "c1",
        vehicle_id: "v1",
        pickup_at: D("10"),
        return_at: D("12"),
        rental_days: 2,
        daily_price_rs: 1000,
        total_rs: 2000,
        dropoff_location_id: null,
        status: "CONFIRMED",
      },
      {
        id: "b2",
        booking_number: 1002,
        customer_id: "c2",
        vehicle_id: "v1",
        pickup_at: D("14"),
        return_at: D("16"),
        rental_days: 2,
        daily_price_rs: 1000,
        total_rs: 2000,
        dropoff_location_id: null,
        status: "CONFIRMED",
      },
    ],
    vehicle_maintenance: [],
    booking_change_requests: [],
    owner_notifications: [],
    booking_events: [],
  });
}

describe("change requests", () => {
  it("quotes an available extension without applying it", async () => {
    const db = world();
    const r = await createChangeRequest(db, "b1", "EXTENSION", {
      newReturnAt: D("13"),
    });
    expect(r.availabilityOk).toBe(true);
    expect(r.quotedAdditionalRs).toBe(1000);
    const { data } = await db
      .from("bookings")
      .select("*")
      .eq("id", "b1")
      .single();
    expect(data?.return_at).toBe(D("12")); // untouched until approval
  });

  it("flags a conflict and suggests a same-model swap", async () => {
    const db = world();
    const r = await createChangeRequest(db, "b1", "EXTENSION", {
      newReturnAt: D("15"),
    });
    expect(r.availabilityOk).toBe(false);
    expect(r.conflictNote).toContain("CAR-002");
  });

  it("approval applies the change, updates the total and writes an event", async () => {
    const db = world();
    const { requestId } = await createChangeRequest(db, "b1", "EXTENSION", {
      newReturnAt: D("13"),
    });
    await applyChangeRequest(db, requestId, "staff1");
    const { data } = await db
      .from("bookings")
      .select("*")
      .eq("id", "b1")
      .single();
    expect(data).toMatchObject({
      return_at: expect.any(String),
      total_rs: 3000,
      rental_days: 3,
    });
    const { data: ev } = await db
      .from("booking_events")
      .select("*")
      .eq("booking_id", "b1");
    expect(ev).toHaveLength(1);
  });

  it("race: another booking takes the slot before approval → VEHICLE_UNAVAILABLE, nothing changes", async () => {
    const db = world();
    const { requestId } = await createChangeRequest(db, "b1", "EXTENSION", {
      newReturnAt: D("13"),
    });
    await db.from("bookings").insert({
      id: "b3",
      customer_id: "c3",
      vehicle_id: "v1",
      pickup_at: D("12"),
      return_at: D("13"),
      status: "CONFIRMED",
    });
    await expect(
      applyChangeRequest(db, requestId, "staff1"),
    ).rejects.toMatchObject({ code: "VEHICLE_UNAVAILABLE" });
    const { data: b } = await db
      .from("bookings")
      .select("*")
      .eq("id", "b1")
      .single();
    expect(b?.return_at).toBe(D("12"));
    const { data: req } = await db
      .from("booking_change_requests")
      .select("*")
      .eq("id", requestId)
      .single();
    expect(req?.status).toBe("PENDING");
  });

  it("a decided request can't be decided again", async () => {
    const db = world();
    const { requestId } = await createChangeRequest(db, "b1", "EXTENSION", {
      newReturnAt: D("13"),
    });
    const out = await declineChangeRequest(
      db,
      requestId,
      "staff1",
      "Car is reserved",
    );
    expect(out.customerMessage).toContain("Car is reserved");
    await expect(
      applyChangeRequest(db, requestId, "staff1"),
    ).rejects.toMatchObject({ code: "REQUEST_NOT_PENDING" });
  });
});

describe("maintenance & reassignment", () => {
  it("maintenance blocks availability like a booking", async () => {
    const db = world();
    await db
      .from("vehicle_maintenance")
      .insert({ vehicle_id: "v2", start_at: D("10"), end_at: D("11") });
    expect(
      await vehicleIsFree(db, "v2", new Date(D("10")), new Date(D("12"))),
    ).toBe(false);
    expect(
      await vehicleIsFree(db, "v2", new Date(D("12")), new Date(D("13"))),
    ).toBe(true);
  });

  it("reassigns to a free vehicle, refuses a conflicting one, expired papers and maintenance", async () => {
    const db = world();
    await reassignBooking(db, "b1", "v2", "staff1");
    expect(
      (await db.from("bookings").select("*").eq("id", "b1").single()).data
        ?.vehicle_id,
    ).toBe("v2");

    await expect(reassignBooking(db, "b2", "v2", "s")).resolves.toBeUndefined(); // v2 is free at 14–16
    await expect(reassignBooking(db, "b1", "v1", "s")).resolves.toBeUndefined(); // b1 (10–12) back on v1: b2 moved away
    await expect(reassignBooking(db, "b2", "v1", "s")).resolves.toBeUndefined(); // 14–16 doesn't overlap b1
    await expect(reassignBooking(db, "b1", "v3", "s")).rejects.toMatchObject({
      code: "VEHICLE_NOT_ASSIGNABLE",
    }); // expired insurance

    await db
      .from("vehicle_maintenance")
      .insert({ vehicle_id: "v2", start_at: D("10"), end_at: D("12") });
    await expect(reassignBooking(db, "b1", "v2", "s")).rejects.toMatchObject({
      code: "VEHICLE_UNAVAILABLE",
    });
  });
});
