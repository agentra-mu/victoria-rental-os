import { describe, expect, it } from "vitest";
import { getAvailableVehicles } from "./getAvailableVehicles";
import { createFakeDb } from "./testing/fakeDb";
import { booking, vehicle } from "./testing/fixtures";
import { DomainError } from "./errors";

const PICKUP = "2026-02-01T10:00:00Z";
const RETURN = "2026-02-03T10:00:00Z";

describe("getAvailableVehicles", () => {
  it("returns a vehicle with no bookings at all", async () => {
    const { db } = createFakeDb({ vehicles: [vehicle({ id: "v1" })] });
    const result = await getAvailableVehicles(db, {
      pickupAt: PICKUP,
      returnAt: RETURN,
    });
    expect(result).toEqual([
      expect.objectContaining({
        make: "Toyota",
        model: "Vitz",
        available: 1,
        vehicleIds: ["v1"],
      }),
    ]);
  });

  it("excludes a vehicle with an overlapping non-cancelled booking", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1" })],
      bookings: [
        booking({
          id: "b1",
          vehicleId: "v1",
          status: "CONFIRMED",
          pickupAt: "2026-02-02T00:00:00Z",
          returnAt: "2026-02-04T00:00:00Z",
        }),
      ],
    });
    const result = await getAvailableVehicles(db, {
      pickupAt: PICKUP,
      returnAt: RETURN,
    });
    expect(result).toEqual([]);
  });

  it("does not exclude a vehicle whose overlapping booking is CANCELLED", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1" })],
      bookings: [
        booking({
          id: "b1",
          vehicleId: "v1",
          status: "CANCELLED",
          pickupAt: "2026-02-02T00:00:00Z",
          returnAt: "2026-02-04T00:00:00Z",
        }),
      ],
    });
    const result = await getAvailableVehicles(db, {
      pickupAt: PICKUP,
      returnAt: RETURN,
    });
    expect(result).toHaveLength(1);
  });

  it("does not exclude a vehicle whose overlapping booking is a mere ENQUIRY", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1" })],
      bookings: [
        booking({
          id: "b1",
          vehicleId: "v1",
          status: "ENQUIRY",
          pickupAt: "2026-02-02T00:00:00Z",
          returnAt: "2026-02-04T00:00:00Z",
        }),
      ],
    });
    const result = await getAvailableVehicles(db, {
      pickupAt: PICKUP,
      returnAt: RETURN,
    });
    expect(result).toHaveLength(1);
  });

  it("allows back-to-back bookings: return 10:00, next pickup 10:00 same car", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1" })],
      bookings: [
        booking({
          id: "b1",
          vehicleId: "v1",
          status: "CONFIRMED",
          pickupAt: "2026-01-30T10:00:00Z",
          returnAt: PICKUP, // ends exactly when the new rental starts
        }),
      ],
    });
    const result = await getAvailableVehicles(db, {
      pickupAt: PICKUP,
      returnAt: RETURN,
    });
    expect(result).toHaveLength(1);
  });

  it("excludes a MAINTENANCE vehicle even with no bookings", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1", status: "MAINTENANCE" })],
    });
    const result = await getAvailableVehicles(db, {
      pickupAt: PICKUP,
      returnAt: RETURN,
    });
    expect(result).toEqual([]);
  });

  it("groups identical make/model/price vehicles and counts them", async () => {
    const { db } = createFakeDb({
      vehicles: [
        vehicle({ id: "v1" }),
        vehicle({ id: "v2" }),
        vehicle({ id: "v3", model: "Corolla" }),
      ],
    });
    const result = await getAvailableVehicles(db, {
      pickupAt: PICKUP,
      returnAt: RETURN,
    });
    expect(result).toHaveLength(2);
    const vitz = result.find((g) => g.model === "Vitz");
    expect(vitz).toMatchObject({ available: 2, vehicleIds: ["v1", "v2"] });
  });

  it("filters by category and home location", async () => {
    const { db } = createFakeDb({
      vehicles: [
        vehicle({ id: "v1", categoryId: "cat-suv", homeLocationId: "loc-1" }),
        vehicle({
          id: "v2",
          categoryId: "cat-economy",
          homeLocationId: "loc-2",
        }),
      ],
    });
    const result = await getAvailableVehicles(db, {
      pickupAt: PICKUP,
      returnAt: RETURN,
      categoryId: "cat-suv",
      locationId: "loc-1",
    });
    expect(result).toEqual([expect.objectContaining({ vehicleIds: ["v1"] })]);
  });

  it("throws INVALID_DATES when return is not after pickup", async () => {
    const { db } = createFakeDb({ vehicles: [vehicle({ id: "v1" })] });
    await expect(
      getAvailableVehicles(db, { pickupAt: RETURN, returnAt: PICKUP }),
    ).rejects.toThrow(DomainError);
  });

  it("keeps physical vehicle ids out of anything but the internal vehicleIds field", async () => {
    const { db } = createFakeDb({ vehicles: [vehicle({ id: "v1" })] });
    const [group] = await getAvailableVehicles(db, {
      pickupAt: PICKUP,
      returnAt: RETURN,
    });
    expect(Object.keys(group).sort()).toEqual(
      [
        "available",
        "categoryId",
        "dailyPriceRs",
        "make",
        "model",
        "vehicleIds",
      ].sort(),
    );
  });
});
