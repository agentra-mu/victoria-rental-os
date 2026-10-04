import { describe, expect, it } from "vitest";
import {
  buildCustomerContextSummary,
  requestNumberLink,
  resolveActiveBooking,
  verifyBookingIdentity,
} from "./customerContext";
import { createFakeDb } from "./testing/fakeDb";
import { booking } from "./testing/fixtures";
import { createFakeMessagingDb } from "@/lib/whatsapp/testing/fakeMessagingDb";
import type { CustomerRow } from "@/lib/whatsapp/ports";

const NOW = new Date("2026-11-01T08:00:00Z");

describe("resolveActiveBooking", () => {
  it("returns null when the customer has no bookings", async () => {
    const { db } = createFakeDb();
    const resolution = await resolveActiveBooking(db, "cust-1", NOW);
    expect(resolution).toEqual({
      booking: null,
      candidates: [],
      ambiguous: false,
      reason: "NONE",
    });
  });

  it("ignores RETURNED, COMPLETED, CANCELLED and NEEDS_HUMAN bookings", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({ id: "b1", customerId: "cust-1", status: "RETURNED" }),
        booking({ id: "b2", customerId: "cust-1", status: "COMPLETED" }),
        booking({ id: "b3", customerId: "cust-1", status: "CANCELLED" }),
        booking({ id: "b4", customerId: "cust-1", status: "NEEDS_HUMAN" }),
      ],
    });
    const resolution = await resolveActiveBooking(db, "cust-1", NOW);
    expect(resolution.booking).toBeNull();
    expect(resolution.reason).toBe("NONE");
  });

  it("a PICKED_UP booking wins over everything else", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "draft",
          customerId: "cust-1",
          status: "ENQUIRY",
          createdAt: "2026-10-31T00:00:00Z",
        }),
        booking({ id: "picked-up", customerId: "cust-1", status: "PICKED_UP" }),
        booking({
          id: "upcoming",
          customerId: "cust-1",
          status: "CONFIRMED",
          pickupAt: "2026-11-01T09:00:00Z",
        }),
      ],
    });
    const resolution = await resolveActiveBooking(db, "cust-1", NOW);
    expect(resolution.ambiguous).toBe(false);
    expect(resolution.reason).toBe("PICKED_UP");
    expect(resolution.booking?.id).toBe("picked-up");
  });

  it("flags two PICKED_UP bookings as ambiguous", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({ id: "p1", customerId: "cust-1", status: "PICKED_UP" }),
        booking({ id: "p2", customerId: "cust-1", status: "PICKED_UP" }),
      ],
    });
    const resolution = await resolveActiveBooking(db, "cust-1", NOW);
    expect(resolution.ambiguous).toBe(true);
    expect(resolution.booking).toBeNull();
    expect(resolution.candidates.map((b) => b.id).sort()).toEqual(["p1", "p2"]);
  });

  it("picks the upcoming booking nearest to now when there's no PICKED_UP booking", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "far",
          customerId: "cust-1",
          status: "CONFIRMED",
          pickupAt: "2026-12-01T09:00:00Z",
        }),
        booking({
          id: "near",
          customerId: "cust-1",
          status: "PENDING_DOCUMENTS",
          pickupAt: "2026-11-02T09:00:00Z",
        }),
      ],
    });
    const resolution = await resolveActiveBooking(db, "cust-1", NOW);
    expect(resolution.reason).toBe("UPCOMING");
    expect(resolution.booking?.id).toBe("near");
  });

  it("an overdue upcoming booking (pickup already in the past) still surfaces as nearest", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "overdue",
          customerId: "cust-1",
          status: "CONFIRMED",
          pickupAt: "2026-10-30T09:00:00Z",
        }),
        booking({
          id: "later",
          customerId: "cust-1",
          status: "CONFIRMED",
          pickupAt: "2026-12-15T09:00:00Z",
        }),
      ],
    });
    const resolution = await resolveActiveBooking(db, "cust-1", NOW);
    expect(resolution.booking?.id).toBe("overdue");
  });

  it("flags a tie between two equally-near upcoming bookings as ambiguous", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "u1",
          customerId: "cust-1",
          status: "CONFIRMED",
          pickupAt: "2026-11-03T08:00:00Z",
        }),
        booking({
          id: "u2",
          customerId: "cust-1",
          status: "DOCUMENTS_VERIFIED",
          pickupAt: "2026-10-30T08:00:00Z",
        }),
      ],
    });
    const resolution = await resolveActiveBooking(db, "cust-1", NOW);
    expect(resolution.ambiguous).toBe(true);
    expect(resolution.reason).toBe("UPCOMING");
    expect(resolution.candidates.map((b) => b.id).sort()).toEqual(["u1", "u2"]);
  });

  it("falls back to the most recently created draft when nothing is PICKED_UP or upcoming", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "older-draft",
          customerId: "cust-1",
          status: "ENQUIRY",
          createdAt: "2026-10-01T00:00:00Z",
        }),
        booking({
          id: "newer-draft",
          customerId: "cust-1",
          status: "CAR_SELECTED",
          createdAt: "2026-10-20T00:00:00Z",
        }),
      ],
    });
    const resolution = await resolveActiveBooking(db, "cust-1", NOW);
    expect(resolution.reason).toBe("DRAFT");
    expect(resolution.booking?.id).toBe("newer-draft");
  });

  it("flags two equally-recent drafts as ambiguous", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "d1",
          customerId: "cust-1",
          status: "ENQUIRY",
          createdAt: "2026-10-20T00:00:00Z",
        }),
        booking({
          id: "d2",
          customerId: "cust-1",
          status: "DATES_SELECTED",
          createdAt: "2026-10-20T00:00:00Z",
        }),
      ],
    });
    const resolution = await resolveActiveBooking(db, "cust-1", NOW);
    expect(resolution.ambiguous).toBe(true);
    expect(resolution.reason).toBe("DRAFT");
  });

  it("only considers this customer's bookings", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({ id: "mine", customerId: "cust-1", status: "PICKED_UP" }),
        booking({ id: "theirs", customerId: "cust-2", status: "PICKED_UP" }),
      ],
    });
    const resolution = await resolveActiveBooking(db, "cust-1", NOW);
    expect(resolution.booking?.id).toBe("mine");
  });
});

describe("buildCustomerContextSummary", () => {
  async function fakeCustomer(fullName: string): Promise<{
    messaging: ReturnType<typeof createFakeMessagingDb>;
    customer: CustomerRow;
  }> {
    const messaging = createFakeMessagingDb();
    const created = await messaging.db.findOrCreateCustomer("+23057600000");
    const customer = await messaging.db.updateCustomerFullName(
      created.id,
      fullName,
    );
    return { messaging, customer };
  }

  it("reports an unknown customer without throwing", async () => {
    const { db } = createFakeDb();
    const messaging = createFakeMessagingDb();
    const summary = await buildCustomerContextSummary(
      { domainDb: db, messaging: messaging.db },
      "missing-customer",
      NOW,
    );
    expect(summary).toMatch(/unknown customer/i);
  });

  it("includes name, code, active booking, other upcoming, completed count and open items", async () => {
    const { messaging, customer } = await fakeCustomer("Jean Paul");
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "active",
          customerId: customer.id,
          bookingNumber: 1001,
          status: "CONFIRMED",
          pickupAt: "2026-11-02T09:00:00Z",
        }),
        booking({
          id: "other-upcoming",
          customerId: customer.id,
          bookingNumber: 1002,
          status: "PENDING_DOCUMENTS",
          pickupAt: "2026-12-10T09:00:00Z",
        }),
        booking({
          id: "done-1",
          customerId: customer.id,
          bookingNumber: 1003,
          status: "COMPLETED",
        }),
        booking({
          id: "done-2",
          customerId: customer.id,
          bookingNumber: 1004,
          status: "COMPLETED",
        }),
      ],
    });
    await messaging.db.createOwnerNotification({
      type: "DELAY",
      title: "Delay",
      bookingId: "active",
    });

    const summary = await buildCustomerContextSummary(
      { domainDb: db, messaging: messaging.db },
      customer.id,
      NOW,
    );

    expect(summary).toMatch(/Jean Paul/);
    expect(summary).toMatch(customer.customerCode);
    expect(summary).toMatch(/#1001/);
    expect(summary).toMatch(/#1002/);
    expect(summary).toMatch(/Past completed rentals: 2/);
    expect(summary).toMatch(/Open items waiting on the team: 1/);
  });

  it("surfaces ambiguity instead of picking one booking", async () => {
    const { messaging, customer } = await fakeCustomer("Amy");
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "p1",
          customerId: customer.id,
          bookingNumber: 2001,
          status: "PICKED_UP",
        }),
        booking({
          id: "p2",
          customerId: customer.id,
          bookingNumber: 2002,
          status: "PICKED_UP",
        }),
      ],
    });

    const summary = await buildCustomerContextSummary(
      { domainDb: db, messaging: messaging.db },
      customer.id,
      NOW,
    );

    expect(summary).toMatch(/multiple equally-plausible/i);
    expect(summary).toMatch(/#2001/);
    expect(summary).toMatch(/#2002/);
  });
});

describe("verifyBookingIdentity", () => {
  it("verifies when the booking number and name match", async () => {
    const messaging = createFakeMessagingDb();
    const customer = await messaging.db.findOrCreateCustomer("+23057600001");
    await messaging.db.updateCustomerFullName(customer.id, "Jean Paul Dupont");
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "b1",
          customerId: customer.id,
          bookingNumber: 5001,
          status: "CONFIRMED",
        }),
      ],
    });

    const result = await verifyBookingIdentity(
      { domainDb: db, messaging: messaging.db },
      5001,
      "  jean   paul dupont ",
    );

    expect(result.verified).toBe(true);
    expect(result.booking?.id).toBe("b1");
  });

  it("does not verify a name mismatch", async () => {
    const messaging = createFakeMessagingDb();
    const customer = await messaging.db.findOrCreateCustomer("+23057600002");
    await messaging.db.updateCustomerFullName(customer.id, "Jean Paul Dupont");
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "b1",
          customerId: customer.id,
          bookingNumber: 5002,
          status: "CONFIRMED",
        }),
      ],
    });

    const result = await verifyBookingIdentity(
      { domainDb: db, messaging: messaging.db },
      5002,
      "Someone Else",
    );

    expect(result.verified).toBe(false);
    expect(result.booking).toBeNull();
  });

  it("does not verify an unknown booking number", async () => {
    const { db } = createFakeDb();
    const messaging = createFakeMessagingDb();
    const result = await verifyBookingIdentity(
      { domainDb: db, messaging: messaging.db },
      9999,
      "Anyone",
    );
    expect(result.verified).toBe(false);
  });

  it("does not verify when the booking's customer has no name on file", async () => {
    const messaging = createFakeMessagingDb();
    const customer = await messaging.db.findOrCreateCustomer("+23057600003");
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "b1",
          customerId: customer.id,
          bookingNumber: 5003,
          status: "CONFIRMED",
        }),
      ],
    });

    const result = await verifyBookingIdentity(
      { domainDb: db, messaging: messaging.db },
      5003,
      "Anyone",
    );
    expect(result.verified).toBe(false);
  });
});

describe("requestNumberLink", () => {
  it("raises an OTHER owner notification scoped to the booking, never links anything itself", async () => {
    const messaging = createFakeMessagingDb();
    const b = booking({ id: "b1", bookingNumber: 6001, customerId: "cust-1" });

    await requestNumberLink(messaging.db, {
      newWhatsappNumber: "+23057600099",
      booking: b,
      claimedFullName: "Jean Paul Dupont",
    });

    expect(messaging.notifications).toHaveLength(1);
    expect(messaging.notifications[0]).toMatchObject({
      type: "OTHER",
      bookingId: "b1",
      status: "OPEN",
    });
    expect(messaging.notifications[0].body).toMatch(/\+23057600099/);
    expect(messaging.notifications[0].body).toMatch(/6001/);
  });
});
