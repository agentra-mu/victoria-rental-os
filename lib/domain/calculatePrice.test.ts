import { describe, expect, it } from "vitest";
import { calculatePrice } from "./calculatePrice";
import { createFakeDb } from "./testing/fakeDb";
import { location, vehicle } from "./testing/fixtures";
import { DomainError } from "./errors";

const PICKUP = "2026-02-01T10:00:00Z";
const RETURN = "2026-02-03T10:00:00Z"; // 2 days

describe("calculatePrice", () => {
  it("prices a plain rental with no location fees", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1", dailyPriceRs: 1200 })],
      locations: [location({ id: "loc-1", extraFeeRs: 0 })],
    });
    const price = await calculatePrice(db, {
      vehicleId: "v1",
      pickupAt: PICKUP,
      returnAt: RETURN,
      pickupLocationId: "loc-1",
    });
    expect(price).toMatchObject({
      rentalDays: 2,
      dailyPriceRs: 1200,
      baseRs: 2400,
      locationFeesRs: 0,
      totalRs: 2400,
    });
    expect(price.lineItems).toHaveLength(1);
  });

  it("adds a pickup location fee", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1", dailyPriceRs: 1000 })],
      locations: [location({ id: "loc-1", extraFeeRs: 300 })],
    });
    const price = await calculatePrice(db, {
      vehicleId: "v1",
      pickupAt: PICKUP,
      returnAt: RETURN,
      pickupLocationId: "loc-1",
    });
    expect(price.locationFeesRs).toBe(300);
    expect(price.totalRs).toBe(1000 * 2 + 300);
  });

  it("adds both pickup and drop-off fees when they differ", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1", dailyPriceRs: 1000 })],
      locations: [
        location({ id: "loc-1", extraFeeRs: 300 }),
        location({ id: "loc-2", extraFeeRs: 500 }),
      ],
    });
    const price = await calculatePrice(db, {
      vehicleId: "v1",
      pickupAt: PICKUP,
      returnAt: RETURN,
      pickupLocationId: "loc-1",
      dropoffLocationId: "loc-2",
    });
    expect(price.locationFeesRs).toBe(800);
    expect(price.totalRs).toBe(1000 * 2 + 800);
  });

  it("does not double-charge when pickup and drop-off are the same location", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1", dailyPriceRs: 1000 })],
      locations: [location({ id: "loc-1", extraFeeRs: 300 })],
    });
    const price = await calculatePrice(db, {
      vehicleId: "v1",
      pickupAt: PICKUP,
      returnAt: RETURN,
      pickupLocationId: "loc-1",
      dropoffLocationId: "loc-1",
    });
    expect(price.locationFeesRs).toBe(300);
  });

  it("adds extras as a line item", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1", dailyPriceRs: 1000 })],
      locations: [location({ id: "loc-1" })],
    });
    const price = await calculatePrice(db, {
      vehicleId: "v1",
      pickupAt: PICKUP,
      returnAt: RETURN,
      pickupLocationId: "loc-1",
      extrasRs: 250,
    });
    expect(price.extrasRs).toBe(250);
    expect(price.totalRs).toBe(1000 * 2 + 250);
    expect(
      price.lineItems.some(
        (li) => li.label === "Extras" && li.amountRs === 250,
      ),
    ).toBe(true);
  });

  it("throws VEHICLE_NOT_FOUND for an unknown vehicle", async () => {
    const { db } = createFakeDb({ locations: [location({ id: "loc-1" })] });
    await expect(
      calculatePrice(db, {
        vehicleId: "missing",
        pickupAt: PICKUP,
        returnAt: RETURN,
        pickupLocationId: "loc-1",
      }),
    ).rejects.toThrow(DomainError);
  });

  it("throws LOCATION_NOT_FOUND for an unknown pickup location", async () => {
    const { db } = createFakeDb({ vehicles: [vehicle({ id: "v1" })] });
    await expect(
      calculatePrice(db, {
        vehicleId: "v1",
        pickupAt: PICKUP,
        returnAt: RETURN,
        pickupLocationId: "missing",
      }),
    ).rejects.toThrow(DomainError);
  });
});
