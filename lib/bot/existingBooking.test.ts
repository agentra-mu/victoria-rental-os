import { describe, expect, it } from "vitest";
import type { Harness } from "./testing/harness";
import { createBotHarness, idsOf, textOf } from "./testing/harness";
import { LOCATION_AIRPORT, VEHICLE_VITZ } from "./testing/fixtures";

async function withConfirmedBooking(
  extra: Partial<{ documentStatus: "VERIFIED" | "NOT_SUBMITTED" }> = {},
) {
  const h = await createBotHarness({ llm: "forbidden" });
  const b = await h.fakeDb.db.createBooking(h.customer.id);
  await h.fakeDb.db.updateBooking(b.id, {
    vehicleId: VEHICLE_VITZ.id,
    pickupLocationId: LOCATION_AIRPORT.id,
    dropoffLocationId: LOCATION_AIRPORT.id,
    pickupAt: "2026-10-20T06:00:00Z", // 10:00 Mauritius
    returnAt: "2026-10-24T06:00:00Z",
    rentalDays: 4,
    dailyPriceRs: 1200,
    totalRs: 5300,
    status: "CONFIRMED",
    documentStatus: extra.documentStatus ?? "NOT_SUBMITTED",
  });
  return { h, booking: b };
}

describe("existing-booking layer", () => {
  it("shows a status card from DB data with the request options", async () => {
    const { h, booking } = await withConfirmedBooking();
    const r = await h.send({ replyId: "menu:existing_booking" });
    expect(r.handledBy).toBe("button");
    const text = textOf(r.replies);
    expect(text).toContain(`Booking #${booking.bookingNumber}`);
    expect(text).toMatch(/Toyota Vitz/);
    expect(text).toMatch(/SSR International Airport/);
    expect(text).toMatch(/Rs 5,300/);
    expect(text).toMatch(/Payment: cash on collection/);
    expect(text).toMatch(/Documents: not received yet/);
    expect(idsOf(r.replies)).toEqual([
      "req:delay",
      "req:extension",
      "req:pickup_change",
      "req:cancel",
      "menu:talk_human",
    ]);
  });

  it("never says documents are approved unless VERIFIED", async () => {
    const { h } = await withConfirmedBooking({
      documentStatus: "NOT_SUBMITTED",
    });
    expect(
      textOf((await h.send({ replyId: "menu:existing_booking" })).replies),
    ).not.toMatch(/verified|approved/i);
    const v = await withConfirmedBooking({ documentStatus: "VERIFIED" });
    expect(
      textOf((await v.h.send({ replyId: "menu:existing_booking" })).replies),
    ).toMatch(/Documents: verified/);
  });

  it("no booking → templated 'none found'", async () => {
    const h = await createBotHarness({ llm: "forbidden" });
    const r = await h.send({ replyId: "menu:existing_booking" });
    expect(textOf(r.replies)).toMatch(/couldn't find a confirmed booking/);
  });

  it("delay: 'I'll be 2 hours late' files a request and never edits the booking", async () => {
    const { h, booking } = await withConfirmedBooking();
    const open = await h.send("I will be late");
    expect(open.handledBy).toBe("existing_booking");
    expect(h.state().step).toBe("CHANGE_REQUEST_DETAILS");
    const confirm = await h.send("2 hours");
    expect(textOf(confirm.replies)).toMatch(
      /isn't approved until they confirm/,
    );
    expect(idsOf(confirm.replies)).toEqual([
      "confirm:yes",
      "confirm:change",
      "confirm:cancel",
    ]);
    const sent = await h.send({ replyId: "confirm:yes" });
    expect(textOf(sent.replies)).toMatch(/sent to our team/);
    expect(textOf(sent.replies)).toMatch(/not approved yet/);
    expect(h.changeRequests).toEqual([
      {
        bookingId: booking.id,
        type: "RETURN_DELAY",
        details: {
          newReturnAt: "2026-10-24T08:00:00.000Z",
          newPickupAt: undefined,
          note: undefined,
        },
      },
    ]);
    const stored = h.fakeDb.bookings.get(booking.id)!;
    expect(stored.returnAt).toBe("2026-10-24T06:00:00Z");
    expect(stored.status).toBe("CONFIRMED");
    expect(h.llmCalls()).toBe(0);
  });

  it("pickup-time change", async () => {
    const { h, booking } = await withConfirmedBooking();
    await h.send({ replyId: "menu:existing_booking" });
    await h.send({ replyId: "req:pickup_change" });
    await h.send("20 Oct 2pm");
    expect(h.state().change?.newPickupAt).toBe("2026-10-20T10:00:00.000Z");
    await h.send("yes");
    expect(h.changeRequests[0]).toMatchObject({
      bookingId: booking.id,
      type: "PICKUP_TIME_CHANGE",
    });
    expect(h.fakeDb.bookings.get(booking.id)!.pickupAt).toBe(
      "2026-10-20T06:00:00Z",
    );
  });

  it("a date-only pickup change keeps the current time", async () => {
    const { h } = await withConfirmedBooking();
    await h.send({ replyId: "req:pickup_change" });
    await h.send("21 Oct");
    expect(h.state().change?.newPickupAt).toBe("2026-10-21T06:00:00.000Z");
  });

  it("extension shows the quote but promises nothing", async () => {
    const { h } = await withConfirmedBooking();
    await h.send("I would like to extend my rental");
    expect(h.state().change?.type).toBe("EXTENSION");
    await h.send("26 Oct");
    const sent = await h.send({ replyId: "confirm:yes" });
    const text = textOf(sent.replies);
    expect(text).toMatch(/Estimated extra cost if approved: Rs 2,400/);
    expect(text).toMatch(/not approved yet/);
    expect(text).not.toMatch(/has been approved|is approved\b/);
    expect(h.changeRequests[0].type).toBe("EXTENSION");
  });

  it("an extension that isn't later than the current return is refused", async () => {
    const { h } = await withConfirmedBooking();
    await h.send({ replyId: "req:extension" });
    const r = await h.send("22 Oct");
    expect(textOf(r.replies)).toMatch(/after the pickup|later/);
    expect(h.changeRequests).toHaveLength(0);
  });

  it("CANCEL on a confirmed booking opens a cancellation request, not a cancellation", async () => {
    const { h, booking } = await withConfirmedBooking();
    const r = await h.send("cancel my booking");
    expect(h.state().change?.type).toBe("CANCELLATION");
    expect(idsOf(r.replies)).toContain("confirm:yes");
    await h.send({ replyId: "confirm:yes" });
    expect(h.changeRequests[0].type).toBe("CANCELLATION");
    expect(h.fakeDb.bookings.get(booking.id)!.status).toBe("CONFIRMED");
  });

  it("'send the link again' re-shows the upload link", async () => {
    const { h, booking } = await withConfirmedBooking();
    await h.fakeDb.db.updateBooking(booking.id, {
      status: "PENDING_DOCUMENTS",
      uploadToken: "tok123",
      uploadTokenExpiresAt: "2026-12-01T00:00:00Z",
    });
    const r = await h.send("Can you send me the upload link again?");
    expect(textOf(r.replies)).toContain(
      "https://app.example.com/documents/tok123",
    );
  });

  it("several bookings → asks which one", async () => {
    const { h } = await withConfirmedBooking();
    const b2 = await h.fakeDb.db.createBooking(h.customer.id);
    await h.fakeDb.db.updateBooking(b2.id, {
      vehicleId: "veh-swift",
      pickupLocationId: LOCATION_AIRPORT.id,
      pickupAt: "2026-10-20T06:00:00Z",
      returnAt: "2026-10-22T06:00:00Z",
      status: "CONFIRMED",
    });
    const r = await h.send({ replyId: "menu:existing_booking" });
    expect(textOf(r.replies)).toMatch(/more than one booking/);
    expect(idsOf(r.replies).every((id) => id.startsWith("bk:"))).toBe(true);
  });
});

export type { Harness };
