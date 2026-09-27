import { describe, expect, it } from "vitest";
import { confirmBooking } from "./confirmBooking";
import { createBookingDraft } from "./createBookingDraft";
import { updateBookingDraft } from "./updateBookingDraft";
import { createFakeDb } from "./testing/fakeDb";
import { booking, location, vehicle } from "./testing/fixtures";
import { DomainError } from "./errors";
import type { DomainDb } from "./ports";

const NOW = new Date("2026-01-15T00:00:00Z");
const PICKUP = "2026-02-01T10:00:00Z";
const RETURN = "2026-02-03T10:00:00Z";

function seedDatesSelected(id = "b1") {
  return createFakeDb({
    vehicles: [vehicle({ id: "v1" })],
    locations: [location({ id: "loc-1" })],
    bookings: [
      booking({
        id,
        status: "DATES_SELECTED",
        vehicleId: "v1",
        pickupLocationId: "loc-1",
        pickupAt: PICKUP,
        returnAt: RETURN,
      }),
    ],
  });
}

describe("confirmBooking", () => {
  it("moves DATES_SELECTED to PENDING_DOCUMENTS and issues a 72h upload token", async () => {
    const { db } = seedDatesSelected();
    const updated = await confirmBooking(db, "b1", NOW);
    expect(updated.status).toBe("PENDING_DOCUMENTS");
    expect(updated.uploadToken).toBeTruthy();
    expect(
      new Date(updated.uploadTokenExpiresAt!).getTime() - NOW.getTime(),
    ).toBe(72 * 60 * 60 * 1000);
  });

  it("throws ILLEGAL_TRANSITION when called from any status other than DATES_SELECTED", async () => {
    const { db } = createFakeDb({
      bookings: [booking({ id: "b1", status: "ENQUIRY" })],
    });
    await expect(confirmBooking(db, "b1", NOW)).rejects.toThrow(DomainError);
  });

  it("throws INCOMPLETE_BOOKING if dates or vehicle are missing", async () => {
    const { db } = createFakeDb({
      bookings: [booking({ id: "b1", status: "DATES_SELECTED" })],
    });
    await expect(confirmBooking(db, "b1", NOW)).rejects.toThrow(DomainError);
  });

  it("throws BOOKING_NOT_FOUND for an unknown booking", async () => {
    const { db } = createFakeDb();
    await expect(confirmBooking(db, "missing", NOW)).rejects.toThrow(
      DomainError,
    );
  });

  it("rejects confirmation when the vehicle was already taken for those dates by another booking", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1" })],
      locations: [location({ id: "loc-1" })],
      bookings: [
        booking({
          id: "b1",
          status: "DATES_SELECTED",
          vehicleId: "v1",
          pickupLocationId: "loc-1",
          pickupAt: PICKUP,
          returnAt: RETURN,
        }),
        booking({
          id: "taken",
          status: "CONFIRMED",
          vehicleId: "v1",
          pickupLocationId: "loc-1",
          pickupAt: PICKUP,
          returnAt: RETURN,
        }),
      ],
    });
    await expect(confirmBooking(db, "b1", NOW)).rejects.toMatchObject({
      code: "VEHICLE_UNAVAILABLE",
    });
  });

  it("concurrent confirmation of the same vehicle: two customers racing for the same car/dates — only one gets through", async () => {
    // The exclusion constraint covers every status except CANCELLED/ENQUIRY,
    // so two DATES_SELECTED bookings for the same vehicle/overlapping time
    // can never both exist — the second updateBookingDraft call is where the
    // race is actually resolved (the fake DB mirrors the real constraint).
    // Whichever draft wins that race is then free to confirm normally.
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1" })],
      locations: [location({ id: "loc-1" })],
    });

    const draftA = await createBookingDraft(db, "cust-a");
    const draftB = await createBookingDraft(db, "cust-b");

    const fields = {
      vehicleId: "v1",
      pickupAt: PICKUP,
      returnAt: RETURN,
      pickupLocationId: "loc-1",
    };
    const winner = await updateBookingDraft(db, draftA.id, fields, NOW);
    expect(winner.status).toBe("DATES_SELECTED");

    await expect(
      updateBookingDraft(db, draftB.id, fields, NOW),
    ).rejects.toMatchObject({
      code: "VEHICLE_UNAVAILABLE",
    });

    const confirmed = await confirmBooking(db, draftA.id, NOW);
    expect(confirmed.status).toBe("PENDING_DOCUMENTS");
  });

  it("converts a DB-level exclusion-constraint violation into VEHICLE_UNAVAILABLE, not a raw error", async () => {
    // Simulates the true race: the application-level pre-check runs against
    // stale data (still reports the vehicle as free) but the write itself —
    // Postgres's exclusion constraint — catches the conflict.
    const { db: realDb } = seedDatesSelected("b1");
    const racyDb: DomainDb = {
      ...realDb,
      async findOverlappingVehicleIds() {
        return new Set<string>(); // stale: reports no conflict
      },
      async updateBooking() {
        throw {
          code: "23P01",
          message: "conflicting key value violates exclusion constraint",
        };
      },
    };

    await expect(confirmBooking(racyDb, "b1", NOW)).rejects.toMatchObject({
      code: "VEHICLE_UNAVAILABLE",
    });
  });

  it("re-throws an unrelated database error unchanged", async () => {
    const { db: realDb } = seedDatesSelected("b1");
    const brokenDb: DomainDb = {
      ...realDb,
      async updateBooking() {
        throw new Error("connection reset");
      },
    };
    await expect(confirmBooking(brokenDb, "b1", NOW)).rejects.toThrow(
      "connection reset",
    );
  });
});
