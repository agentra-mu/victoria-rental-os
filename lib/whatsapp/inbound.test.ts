import { describe, expect, it, vi } from "vitest";
import type { TurnResult } from "@/lib/bot/types";
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

function turnResult(overrides: Partial<TurnResult> = {}): TurnResult {
  return {
    replies: [textReply("Bot reply")],
    handledBy: "state_machine",
    trace: {
      layer: "state_machine",
      llmCalls: 0,
      step: "MENU",
      nextStep: "MENU",
      totalMs: 1,
      dbMs: 0,
      llmMs: 0,
    },
    ...overrides,
  };
}

function makeDeps() {
  const messaging = createFakeMessagingDb();
  const getActiveBookingForCustomer = vi.fn().mockResolvedValue(null);
  const runBot = vi.fn().mockResolvedValue(turnResult());
  const deps: InboundDeps = {
    messaging: messaging.db,
    getActiveBookingForCustomer,
    runBot,
  };
  return { deps, messaging, getActiveBookingForCustomer, runBot };
}

describe("normalizeWhatsAppNumber", () => {
  it("adds a leading + if missing", () => {
    expect(normalizeWhatsAppNumber("23057611111")).toBe("+23057611111");
  });
  it("leaves an already-normalized number alone", () => {
    expect(normalizeWhatsAppNumber("+23057611111")).toBe("+23057611111");
  });
});

describe("handleInboundMessage: bot hand-off", () => {
  it("passes the message to the bot and stores the reply tagged with its layer", async () => {
    const { deps, messaging, runBot } = makeDeps();
    runBot.mockResolvedValue(
      turnResult({ handledBy: "faq", generatedBy: "llm" }),
    );
    const result = await handleInboundMessage(deps, basePayload());
    expect(result.replies).toHaveLength(1);
    expect(result.debug?.layer).toBe("faq");
    expect(runBot).toHaveBeenCalledOnce();
    expect(runBot.mock.calls[0][1]).toMatchObject({
      type: "text",
      text: "Hello",
      messageId: "wamid.1",
    });
    expect(messaging.messages).toHaveLength(2);
    expect(messaging.messages[1]).toMatchObject({
      direction: "OUTBOUND",
      handledBy: "faq",
      generatedBy: "llm",
    });
  });

  it("forwards notifyOwner from the bot", async () => {
    const { deps, runBot } = makeDeps();
    runBot.mockResolvedValue(
      turnResult({ notifyOwner: { title: "t", body: "b" } }),
    );
    const result = await handleInboundMessage(deps, basePayload());
    expect(result.notifyOwner).toEqual({ title: "t", body: "b" });
  });

  it("passes button/list replies with their machine id", async () => {
    const { deps, runBot } = makeDeps();
    await handleInboundMessage(
      deps,
      basePayload({ type: "list_reply", text: undefined, replyId: "car:abc" }),
    );
    expect(runBot.mock.calls[0][1]).toMatchObject({
      type: "list_reply",
      replyId: "car:abc",
    });
    expect(runBot.mock.calls[0][2].customer.whatsappNumber).toBe(
      "+23057611111",
    );
  });
});

describe("handleInboundMessage: dedupe", () => {
  it("returns nothing for a retried whatsapp_message_id and doesn't run the bot again", async () => {
    const { deps, messaging, runBot } = makeDeps();
    await handleInboundMessage(deps, basePayload());
    const before = messaging.messages.length;
    const result = await handleInboundMessage(deps, basePayload());
    expect(result).toEqual({ replies: [] });
    expect(messaging.messages).toHaveLength(before);
    expect(runBot).toHaveBeenCalledOnce();
  });

  it("concurrent deliveries of the same message run the bot once", async () => {
    const { deps, runBot } = makeDeps();
    await Promise.all([
      handleInboundMessage(deps, basePayload()),
      handleInboundMessage(deps, basePayload()),
      handleInboundMessage(deps, basePayload()),
    ]);
    expect(runBot).toHaveBeenCalledOnce();
  });
});

describe("handleInboundMessage: HUMAN mode passthrough", () => {
  async function inHumanMode() {
    const ctx = makeDeps();
    const { customer, conversation } =
      await ctx.messaging.db.loadCustomerAndConversation("+23057611111");
    await ctx.messaging.db.setConversationMode(conversation.id, "HUMAN");
    return { ...ctx, customer, conversation };
  }

  it("stores the message and stays silent without calling the bot", async () => {
    const { deps, runBot } = await inHumanMode();
    const result = await handleInboundMessage(
      deps,
      basePayload({ text: "still here?" }),
    );
    expect(result).toEqual({ replies: [] });
    expect(runBot).not.toHaveBeenCalled();
  });

  it("notifies the owner once while a notification for the booking is open", async () => {
    const { deps, messaging, getActiveBookingForCustomer } =
      await inHumanMode();
    getActiveBookingForCustomer.mockResolvedValue({
      id: "booking-1",
      status: "CONFIRMED",
    });
    await handleInboundMessage(
      deps,
      basePayload({ messageId: "a", text: "one" }),
    );
    await handleInboundMessage(
      deps,
      basePayload({ messageId: "b", text: "two" }),
    );
    expect(messaging.notifications).toHaveLength(1);
    expect(messaging.notifications[0]).toMatchObject({
      type: "NEEDS_HUMAN",
      bookingId: "booking-1",
    });
  });

  it("STOP still opts the customer out while a person has the chat", async () => {
    const { deps, runBot } = await inHumanMode();
    const result = await handleInboundMessage(
      deps,
      basePayload({ text: "STOP" }),
    );
    expect(runBot).not.toHaveBeenCalled();
    expect(result.replies).toHaveLength(1);
  });
});
