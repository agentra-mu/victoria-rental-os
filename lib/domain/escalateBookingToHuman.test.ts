import { describe, expect, it } from "vitest";
import { escalateBookingToHuman } from "./escalateBookingToHuman";
import { createFakeDb } from "./testing/fakeDb";
import { booking } from "./testing/fixtures";

describe("escalateBookingToHuman", () => {
  it("moves an active booking to NEEDS_HUMAN", async () => {
    const { db } = createFakeDb({
      bookings: [booking({ id: "b1", status: "CONFIRMED" })],
    });
    const updated = await escalateBookingToHuman(db, "b1");
    expect(updated?.status).toBe("NEEDS_HUMAN");
  });

  it("is a no-op for a terminal booking instead of throwing", async () => {
    const { db } = createFakeDb({
      bookings: [booking({ id: "b1", status: "COMPLETED" })],
    });
    const result = await escalateBookingToHuman(db, "b1");
    expect(result?.status).toBe("COMPLETED");
  });

  it("returns null for an unknown booking instead of throwing", async () => {
    const { db } = createFakeDb();
    expect(await escalateBookingToHuman(db, "missing")).toBeNull();
  });
});
