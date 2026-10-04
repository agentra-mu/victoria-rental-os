import { describe, expect, it } from "vitest";
import { loadAgentContext } from "./context";
import {
  createAgentFixture,
  LOCATION_AIRPORT,
  VEHICLE_VITZ,
} from "./testing/fixtures";

describe("loadAgentContext", () => {
  it("flags first contact when only the triggering message exists", async () => {
    const { fakeDb, fakeMessaging } = createAgentFixture();
    const customer =
      await fakeMessaging.db.findOrCreateCustomer("+23057611111");
    const conversation = await fakeMessaging.db.getOrCreateConversation(
      customer.id,
    );
    await fakeMessaging.db.storeMessage({
      conversationId: conversation.id,
      direction: "INBOUND",
      sender: "customer",
      body: "Hi",
    });

    const context = await loadAgentContext(
      {
        domainDb: fakeDb.db,
        messaging: fakeMessaging.db,
        now: () => new Date("2026-10-01T08:00:00Z"),
      },
      conversation.id,
      customer,
      conversation,
    );

    expect(context.isFirstContact).toBe(true);
    expect(context.activeBooking).toBeNull();
    expect(context.knowledgeBase.length).toBeGreaterThan(0);
  });

  it("resolves the active booking's vehicle and location names", async () => {
    const { fakeDb, fakeMessaging } = createAgentFixture();
    const customer =
      await fakeMessaging.db.findOrCreateCustomer("+23057622222");
    const conversation = await fakeMessaging.db.getOrCreateConversation(
      customer.id,
    );
    const draft = await fakeDb.db.createBooking(customer.id);
    await fakeDb.db.updateBooking(draft.id, {
      vehicleId: VEHICLE_VITZ.id,
      pickupLocationId: LOCATION_AIRPORT.id,
      dropoffLocationId: LOCATION_AIRPORT.id,
      status: "CAR_SELECTED",
    });

    const context = await loadAgentContext(
      {
        domainDb: fakeDb.db,
        messaging: fakeMessaging.db,
        now: () => new Date("2026-10-01T08:00:00Z"),
      },
      conversation.id,
      customer,
      conversation,
    );

    expect(context.activeBooking).toMatchObject({
      vehicleMake: "Toyota",
      vehicleModel: "Vitz",
      pickupLocationName: "SSR International Airport",
    });
  });

  it("surfaces ambiguous bookings instead of picking one", async () => {
    const { fakeDb, fakeMessaging } = createAgentFixture();
    const customer =
      await fakeMessaging.db.findOrCreateCustomer("+23057633333");
    const conversation = await fakeMessaging.db.getOrCreateConversation(
      customer.id,
    );
    const first = await fakeDb.db.createBooking(customer.id);
    await fakeDb.db.updateBooking(first.id, { status: "PICKED_UP" });
    const second = await fakeDb.db.createBooking(customer.id);
    await fakeDb.db.updateBooking(second.id, { status: "PICKED_UP" });

    const context = await loadAgentContext(
      {
        domainDb: fakeDb.db,
        messaging: fakeMessaging.db,
        now: () => new Date("2026-10-01T08:00:00Z"),
      },
      conversation.id,
      customer,
      conversation,
    );

    expect(context.activeBooking).toBeNull();
    expect(context.ambiguousBookingNumbers?.sort()).toEqual(
      [first.bookingNumber, second.bookingNumber].sort(),
    );
    expect(context.customerContextSummary).toMatch(customer.customerCode);
  });
});
