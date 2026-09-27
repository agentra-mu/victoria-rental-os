import { describe, expect, it } from "vitest";
import { cancelBooking } from "./cancelBooking";
import { createFakeDb } from "./testing/fakeDb";
import { BOOKING_STATUSES } from "./bookingStatus";
import { booking } from "./testing/fixtures";
import { DomainError } from "./errors";

describe("cancelBooking", () => {
  it("cancels a booking from every active status and logs the reason", async () => {
    for (const status of BOOKING_STATUSES) {
      if (status === "CANCELLED" || status === "COMPLETED") continue;
      const { db, events } = createFakeDb({
        bookings: [booking({ id: "b1", status })],
      });
      const updated = await cancelBooking(
        db,
        "b1",
        "customer",
        "changed plans",
      );
      expect(updated.status).toBe("CANCELLED");
      expect(events).toContainEqual(
        expect.objectContaining({
          bookingId: "b1",
          eventType: "BOOKING_CANCELLED",
          actor: "customer",
        }),
      );
    }
  });

  it("throws ILLEGAL_TRANSITION for an already-terminal booking", async () => {
    const { db } = createFakeDb({
      bookings: [booking({ id: "b1", status: "COMPLETED" })],
    });
    await expect(cancelBooking(db, "b1", "owner", "test")).rejects.toThrow(
      DomainError,
    );
  });

  it("throws BOOKING_NOT_FOUND for an unknown booking", async () => {
    const { db } = createFakeDb();
    await expect(cancelBooking(db, "missing", "owner", "test")).rejects.toThrow(
      DomainError,
    );
  });
});
