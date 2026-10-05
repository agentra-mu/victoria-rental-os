import { describe, expect, it } from "vitest";
import { runVerification } from "./run";
import { createFakeDb } from "@/lib/domain/testing/fakeDb";
import { booking } from "@/lib/domain/testing/fixtures";
import { createFakeMessagingDb } from "@/lib/whatsapp/testing/fakeMessagingDb";

describe("runVerification", () => {
  it("flags the booking NEEDS_REVIEW and notifies the owner — never VERIFIED", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({ id: "b1", bookingNumber: 1024, documentStatus: "PENDING" }),
      ],
    });
    const messaging = createFakeMessagingDb();

    await runVerification({ domainDb: db, messaging: messaging.db }, "b1");

    const updated = await db.getBookingById("b1");
    expect(updated?.documentStatus).toBe("NEEDS_REVIEW");
    expect(messaging.notifications).toContainEqual(
      expect.objectContaining({ type: "DOC_REVIEW", bookingId: "b1" }),
    );
    expect(messaging.notifications[0].title).toMatch(/#1024/);
  });

  it("doesn't duplicate the notification if one is already open", async () => {
    const { db } = createFakeDb({
      bookings: [booking({ id: "b1", documentStatus: "PENDING" })],
    });
    const messaging = createFakeMessagingDb();
    await messaging.db.createOwnerNotification({
      type: "DOC_REVIEW",
      title: "Already flagged",
      bookingId: "b1",
    });

    await runVerification({ domainDb: db, messaging: messaging.db }, "b1");

    expect(messaging.notifications).toHaveLength(1);
  });

  it("is a no-op for an unknown booking", async () => {
    const { db } = createFakeDb();
    const messaging = createFakeMessagingDb();
    await expect(
      runVerification({ domainDb: db, messaging: messaging.db }, "missing"),
    ).resolves.toBeUndefined();
    expect(messaging.notifications).toHaveLength(0);
  });
});
