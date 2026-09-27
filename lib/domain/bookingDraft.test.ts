import { describe, expect, it } from "vitest";
import { createBookingDraft } from "./createBookingDraft";
import { updateBookingDraft } from "./updateBookingDraft";
import { createFakeDb } from "./testing/fakeDb";
import { booking, location, vehicle } from "./testing/fixtures";
import { DomainError } from "./errors";

const NOW = new Date("2026-01-15T00:00:00Z");
const PICKUP = "2026-02-01T10:00:00Z";
const RETURN = "2026-02-03T10:00:00Z";

function seed() {
  return createFakeDb({
    vehicles: [vehicle({ id: "v1", dailyPriceRs: 1000 })],
    locations: [location({ id: "loc-1" })],
  });
}

describe("createBookingDraft", () => {
  it("starts a new ENQUIRY booking for the customer", async () => {
    const { db } = seed();
    const draft = await createBookingDraft(db, "cust-1");
    expect(draft.status).toBe("ENQUIRY");
    expect(draft.customerId).toBe("cust-1");
  });
});

describe("updateBookingDraft", () => {
  it("moves ENQUIRY to CAR_SELECTED once a vehicle is set", async () => {
    const { db } = seed();
    const draft = await createBookingDraft(db, "cust-1");
    const updated = await updateBookingDraft(
      db,
      draft.id,
      { vehicleId: "v1" },
      NOW,
    );
    expect(updated.status).toBe("CAR_SELECTED");
    expect(updated.vehicleId).toBe("v1");
  });

  it("moves to DATES_SELECTED once vehicle, dates and pickup location are all set, and prices it", async () => {
    const { db } = seed();
    const draft = await createBookingDraft(db, "cust-1");
    const updated = await updateBookingDraft(
      db,
      draft.id,
      {
        vehicleId: "v1",
        pickupAt: PICKUP,
        returnAt: RETURN,
        pickupLocationId: "loc-1",
      },
      NOW,
    );
    expect(updated.status).toBe("DATES_SELECTED");
    expect(updated.rentalDays).toBe(2);
    expect(updated.totalRs).toBe(2000);
  });

  it("re-checks availability and rejects a vehicle already booked for those dates", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1" })],
      locations: [location({ id: "loc-1" })],
      bookings: [
        booking({
          id: "taken",
          vehicleId: "v1",
          status: "CONFIRMED",
          pickupAt: PICKUP,
          returnAt: RETURN,
        }),
      ],
    });
    const draft = await createBookingDraft(db, "cust-1");
    await expect(
      updateBookingDraft(
        db,
        draft.id,
        {
          vehicleId: "v1",
          pickupAt: PICKUP,
          returnAt: RETURN,
          pickupLocationId: "loc-1",
        },
        NOW,
      ),
    ).rejects.toThrow(DomainError);
  });

  it("rejects a pickup date in the past", async () => {
    const { db } = seed();
    const draft = await createBookingDraft(db, "cust-1");
    await expect(
      updateBookingDraft(
        db,
        draft.id,
        {
          vehicleId: "v1",
          pickupAt: "2026-01-01T10:00:00Z",
          returnAt: "2026-01-03T10:00:00Z",
          pickupLocationId: "loc-1",
        },
        NOW,
      ),
    ).rejects.toThrow(DomainError);
  });

  it("floors a very short rental to the 1-day minimum rather than rejecting it", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1" })],
      locations: [location({ id: "loc-1" })],
    });
    const draft = await createBookingDraft(db, "cust-1");
    const updated = await updateBookingDraft(
      db,
      draft.id,
      {
        vehicleId: "v1",
        pickupAt: "2026-02-01T10:00:00Z",
        returnAt: "2026-02-01T10:30:00Z", // 30min — still rounds up to 1 billable day
        pickupLocationId: "loc-1",
      },
      NOW,
    );
    expect(updated.rentalDays).toBe(1);
  });

  it("rejects an unknown pickup location", async () => {
    const { db } = seed();
    const draft = await createBookingDraft(db, "cust-1");
    await expect(
      updateBookingDraft(db, draft.id, { pickupLocationId: "missing" }, NOW),
    ).rejects.toThrow(DomainError);
  });

  it("rejects a location that does not allow pickup", async () => {
    const { db } = createFakeDb({
      vehicles: [vehicle({ id: "v1" })],
      locations: [location({ id: "loc-1", isPickup: false })],
    });
    const draft = await createBookingDraft(db, "cust-1");
    await expect(
      updateBookingDraft(db, draft.id, { pickupLocationId: "loc-1" }, NOW),
    ).rejects.toThrow(DomainError);
  });

  it("rejects editing a booking that has moved past the draft stages", async () => {
    const { db, bookings } = seed();
    const draft = await createBookingDraft(db, "cust-1");
    bookings.set(draft.id, { ...draft, status: "PENDING_DOCUMENTS" });
    await expect(
      updateBookingDraft(db, draft.id, { vehicleId: "v1" }, NOW),
    ).rejects.toThrow(DomainError);
  });

  it("throws BOOKING_NOT_FOUND for an unknown booking id", async () => {
    const { db } = seed();
    await expect(
      updateBookingDraft(db, "missing", { vehicleId: "v1" }, NOW),
    ).rejects.toThrow(DomainError);
  });
});
