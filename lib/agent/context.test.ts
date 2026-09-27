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
});
