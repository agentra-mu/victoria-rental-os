import { describe, expect, it } from "vitest";
import { getFleet } from "./getFleet";
import { createFakeDb } from "./testing/fakeDb";
import { booking, vehicle, vehicleCategory } from "./testing/fixtures";
import { DomainError } from "./errors";

const PICKUP = "2026-02-01T10:00:00Z";
const RETURN = "2026-02-03T10:00:00Z";

describe("getFleet", () => {
  it("groups vehicles by model/price/transmission/seats with category name and totals", async () => {
    const { db } = createFakeDb({
      vehicleCategories: [
        vehicleCategory({ id: "cat-economy", name: "Economy" }),
      ],
      vehicles: [
        vehicle({ id: "v1", categoryId: "cat-economy" }),
        vehicle({ id: "v2", categoryId: "cat-economy" }),
        vehicle({ id: "v3", model: "Corolla", categoryId: "cat-economy" }),
      ],
    });
    const fleet = await getFleet(db);
    expect(fleet).toHaveLength(2);
    const vitz = fleet.find((g) => g.model === "Vitz");
    expect(vitz).toMatchObject({
      categoryName: "Economy",
      total: 2,
      vehicleIds: ["v1", "v2"],
    });
    expect(vitz?.available).toBeUndefined();
  });

  it("excludes MAINTENANCE/RETIRED vehicles from the fleet", async () => {
    const { db } = createFakeDb({
      vehicleCategories: [vehicleCategory({ id: "cat-economy" })],
      vehicles: [vehicle({ id: "v1", status: "MAINTENANCE" })],
    });
    const fleet = await getFleet(db);
    expect(fleet).toEqual([]);
  });

  it("falls back to 'Uncategorized' if the category no longer exists", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1", categoryId: "missing-cat" })],
    });
    const fleet = await getFleet(db);
    expect(fleet[0].categoryName).toBe("Uncategorized");
  });

  it("adds a live availability count when dates are given", async () => {
    const { db } = createFakeDb({
      vehicleCategories: [vehicleCategory({ id: "cat-economy" })],
      vehicles: [
        vehicle({ id: "v1", categoryId: "cat-economy" }),
        vehicle({ id: "v2", categoryId: "cat-economy" }),
      ],
      bookings: [
        booking({
          id: "b1",
          vehicleId: "v1",
          status: "CONFIRMED",
          pickupAt: PICKUP,
          returnAt: RETURN,
        }),
      ],
    });
    const fleet = await getFleet(db, { pickupAt: PICKUP, returnAt: RETURN });
    expect(fleet[0]).toMatchObject({ total: 2, available: 1 });
  });

  it("throws INVALID_DATES if only one of pickupAt/returnAt is given", async () => {
    const { db } = createFakeDb({ vehicles: [vehicle({ id: "v1" })] });
    await expect(getFleet(db, { pickupAt: PICKUP })).rejects.toThrow(
      DomainError,
    );
  });

  it("throws INVALID_DATES if return is not after pickup", async () => {
    const { db } = createFakeDb({ vehicles: [vehicle({ id: "v1" })] });
    await expect(
      getFleet(db, { pickupAt: RETURN, returnAt: PICKUP }),
    ).rejects.toThrow(DomainError);
  });
});
