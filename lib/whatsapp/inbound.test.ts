import { describe, expect, it, vi } from "vitest";
import {
  handleInboundMessage,
  normalizeWhatsAppNumber,
  type InboundDeps,
  type InboundMessagePayload,
} from "./inbound";
import { createFakeMessagingDb } from "./testing/fakeMessagingDb";
import { textReply } from "./replies";

function basePayload(
  overrides: Partial<InboundMessagePayload> = {},
): InboundMessagePayload {
  return {
    from: "23057611111",
    messageId: "wamid.1",
    timestamp: "1700000000",
    type: "text",
    text: "Hello",
    ...overrides,
  };
}

function makeDeps(messagingSeed?: Parameters<typeof createFakeMessagingDb>[0]) {
  const messaging = createFakeMessagingDb(messagingSeed);
  const escalateBookingToHuman = vi.fn().mockResolvedValue(undefined);
  const getActiveBookingForCustomer = vi.fn().mockResolvedValue(null);
  const runAgent = vi.fn().mockResolvedValue([textReply("Agent reply")]);
  const deps: InboundDeps = {
    messaging: messaging.db,
    escalateBookingToHuman,
    getActiveBookingForCustomer,
    runAgent,
  };
  return {
    deps,
    messaging,
    escalateBookingToHuman,
    getActiveBookingForCustomer,
    runAgent,
  };
}

describe("normalizeWhatsAppNumber", () => {
  it("adds a leading + if missing", () => {
    expect(normalizeWhatsAppNumber("23057611111")).toBe("+23057611111");
  });

  it("leaves an already-normalized number alone", () => {
    expect(normalizeWhatsAppNumber("+23057611111")).toBe("+23057611111");
  });
});

describe("handleInboundMessage: dedupe", () => {
  it("processes a new message normally", async () => {
    const { deps, messaging, runAgent } = makeDeps();
    const result = await handleInboundMessage(deps, basePayload());
    expect(result.replies).toHaveLength(1);
    expect(runAgent).toHaveBeenCalledOnce();
    expect(messaging.messages).toHaveLength(2); // inbound + outbound
  });

  it("returns no replies and does nothing else for an already-seen whatsapp_message_id", async () => {
    const { deps, messaging, runAgent } = makeDeps();
    await handleInboundMessage(deps, basePayload());
    const countBefore = messaging.messages.length;

    const result = await handleInboundMessage(deps, basePayload()); // same messageId, retried webhook
    expect(result).toEqual({ replies: [] });
    expect(messaging.messages).toHaveLength(countBefore); // nothing new stored
    expect(runAgent).toHaveBeenCalledOnce(); // not called again
  });
});

describe("handleInboundMessage: HUMAN mode passthrough", () => {
  it("stores the message and returns no replies without calling the agent", async () => {
    const { deps, runAgent } = makeDeps();
    // First message creates the conversation in AI mode; flip it to HUMAN before the next one.
    await handleInboundMessage(
      deps,
      basePayload({ messageId: "wamid.setup", text: "hi" }),
    );
    const customer = await deps.messaging.findOrCreateCustomer("+23057611111");
    const conversation = await deps.messaging.getOrCreateConversation(
      customer.id,
    );
    await deps.messaging.setConversationMode(conversation.id, "HUMAN");

    runAgent.mockClear();
    const result = await handleInboundMessage(
      deps,
      basePayload({ messageId: "wamid.2", text: "still here?" }),
    );
    expect(result).toEqual({ replies: [] });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("creates an owner notification tied to the active booking, but only once while it's open", async () => {
    const { deps, messaging, getActiveBookingForCustomer } = makeDeps();
    getActiveBookingForCustomer.mockResolvedValue({
      id: "booking-1",
      status: "CONFIRMED",
    });

    const customer = await deps.messaging.findOrCreateCustomer("+23057611111");
    const conversation = await deps.messaging.getOrCreateConversation(
      customer.id,
    );
    await deps.messaging.setConversationMode(conversation.id, "HUMAN");

    await handleInboundMessage(
      deps,
      basePayload({ messageId: "wamid.a", text: "one" }),
    );
    await handleInboundMessage(
      deps,
      basePayload({ messageId: "wamid.b", text: "two" }),
    );

    expect(messaging.notifications).toHaveLength(1);
    expect(messaging.notifications[0]).toMatchObject({
      type: "NEEDS_HUMAN",
      bookingId: "booking-1",
    });
  });
});

describe("handleInboundMessage: takeover", () => {
  it.each(["human", "Human", "AGENT", "  agent  "])(
    "switches the conversation to HUMAN on %j",
    async (text) => {
      const { deps, messaging, runAgent } = makeDeps();
      const result = await handleInboundMessage(deps, basePayload({ text }));

      expect(runAgent).not.toHaveBeenCalled();
      expect(result.replies).toEqual([
        textReply(
          "Thanks — a member of our team will be in touch with you shortly.",
        ),
      ]);
      expect(result.notifyOwner).toBeDefined();

      const customer = await messaging.db.findOrCreateCustomer("+23057611111");
      const conversation = await messaging.db.getOrCreateConversation(
        customer.id,
      );
      expect(conversation.mode).toBe("HUMAN");
    },
  );

  it("escalates the customer's active booking to NEEDS_HUMAN", async () => {
    const { deps, escalateBookingToHuman, getActiveBookingForCustomer } =
      makeDeps();
    getActiveBookingForCustomer.mockResolvedValue({
      id: "booking-1",
      status: "CONFIRMED",
    });

    await handleInboundMessage(deps, basePayload({ text: "human" }));

    expect(escalateBookingToHuman).toHaveBeenCalledWith("booking-1");
  });

  it("does not try to escalate when the customer has no active booking", async () => {
    const { deps, escalateBookingToHuman } = makeDeps();
    await handleInboundMessage(deps, basePayload({ text: "human" }));
    expect(escalateBookingToHuman).not.toHaveBeenCalled();
  });

  it("does not treat a normal message containing the word as a takeover trigger", async () => {
    const { deps, runAgent } = makeDeps();
    const result = await handleInboundMessage(
      deps,
      basePayload({ text: "is there a human available later?" }),
    );
    expect(runAgent).toHaveBeenCalledOnce();
    expect(result.notifyOwner).toBeUndefined();
  });

  it("treats a button/list reply id as the message text, not as a takeover trigger", async () => {
    const { deps, runAgent } = makeDeps();
    await handleInboundMessage(
      deps,
      basePayload({ type: "list_reply", text: undefined, replyId: "human" }),
    );
    // Even though the row id happens to be "human", only free-typed text triggers takeover.
    expect(runAgent).toHaveBeenCalledOnce();
  });
});
