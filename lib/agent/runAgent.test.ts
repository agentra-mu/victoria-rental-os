import { describe, expect, it } from "vitest";
import { buildMessageHistory, runAgentTurn } from "./runAgent";
import {
  createAgentFixture,
  LOCATION_AIRPORT,
  VEHICLE_VITZ,
} from "./testing/fixtures";
import {
  createReactiveModelClient,
  createScriptedModelClient,
  lastToolResultData,
  textMessage,
  toolUseMessage,
} from "./testing/fakeModelClient";
import type { AgentDeps } from "./ports";
import type { MessageRow } from "@/lib/whatsapp/ports";

async function setUp(
  messageBodies: { direction: "INBOUND" | "OUTBOUND"; body: string }[],
) {
  const { fakeDb, fakeMessaging } = createAgentFixture();
  const customer = await fakeMessaging.db.findOrCreateCustomer("+23057611111");
  const conversation = await fakeMessaging.db.getOrCreateConversation(
    customer.id,
  );
  for (const message of messageBodies) {
    await fakeMessaging.db.storeMessage({
      conversationId: conversation.id,
      direction: message.direction,
      sender: message.direction === "INBOUND" ? "customer" : "ai",
      body: message.body,
    });
  }
  return { fakeDb, fakeMessaging, customer, conversation };
}

function deps(
  fakeDb: ReturnType<typeof createAgentFixture>["fakeDb"],
  fakeMessaging: ReturnType<typeof createAgentFixture>["fakeMessaging"],
  responses: Parameters<typeof createScriptedModelClient>[0],
): AgentDeps {
  return {
    domainDb: fakeDb.db,
    messaging: fakeMessaging.db,
    model: createScriptedModelClient(responses),
    now: () => new Date("2026-10-01T08:00:00Z"),
  };
}

describe("runAgentTurn: first contact", () => {
  it("returns the main menu without calling the model", async () => {
    const { fakeDb, fakeMessaging, conversation } = await setUp([
      { direction: "INBOUND", body: "Hi" },
    ]);
    const replies = await runAgentTurn(
      deps(fakeDb, fakeMessaging, []),
      conversation.id,
    );

    expect(replies).toHaveLength(1);
    expect(replies[0].type).toBe("list");
    if (replies[0].type === "list") {
      expect(replies[0].interactive.action.sections[0].rows).toHaveLength(4);
    }
  });
});

describe("runAgentTurn: plain text turn", () => {
  it("returns the model's text reply as-is", async () => {
    const { fakeDb, fakeMessaging, conversation } = await setUp([
      { direction: "INBOUND", body: "Hi" },
      { direction: "OUTBOUND", body: "Welcome!" },
      { direction: "INBOUND", body: "What are your opening hours?" },
    ]);
    const replies = await runAgentTurn(
      deps(fakeDb, fakeMessaging, [textMessage("We're open every day.")]),
      conversation.id,
    );

    expect(replies).toEqual([{ type: "text", text: "We're open every day." }]);
  });
});

describe("runAgentTurn: tool-driven replies", () => {
  it("wraps the reply as a list after get_fleet", async () => {
    const { fakeDb, fakeMessaging, conversation } = await setUp([
      { direction: "INBOUND", body: "Hi" },
      { direction: "OUTBOUND", body: "Welcome!" },
      { direction: "INBOUND", body: "What cars do you have?" },
    ]);
    const replies = await runAgentTurn(
      deps(fakeDb, fakeMessaging, [
        toolUseMessage([{ id: "call_1", name: "get_fleet", input: {} }]),
        textMessage("Here's our fleet:"),
      ]),
      conversation.id,
    );

    expect(replies).toHaveLength(1);
    expect(replies[0].type).toBe("list");
    if (replies[0].type === "list") {
      expect(
        replies[0].interactive.action.sections[0].rows.length,
      ).toBeGreaterThan(0);
    }
  });

  it("wraps the reply as confirm/change/cancel buttons after get_price_quote", async () => {
    const { fakeDb, fakeMessaging, conversation } = await setUp([
      { direction: "INBOUND", body: "Hi" },
      { direction: "OUTBOUND", body: "Welcome!" },
      { direction: "INBOUND", body: "Book the Vitz please" },
    ]);
    const model = createReactiveModelClient((messages, callIndex) => {
      if (callIndex === 0) {
        return toolUseMessage([
          {
            id: "call_1",
            name: "start_or_update_booking_draft",
            input: { vehicleId: VEHICLE_VITZ.id },
          },
        ]);
      }
      if (callIndex === 1) {
        return toolUseMessage([
          {
            id: "call_2",
            name: "start_or_update_booking_draft",
            input: {
              pickupAt: "2026-11-01T10:00:00Z",
              returnAt: "2026-11-05T10:00:00Z",
              pickupLocationId: LOCATION_AIRPORT.id,
            },
          },
        ]);
      }
      if (callIndex === 2) {
        const { bookingId } = lastToolResultData(messages) as {
          bookingId: string;
        };
        return toolUseMessage([
          { id: "call_3", name: "get_price_quote", input: { bookingId } },
        ]);
      }
      return textMessage("Here's your summary — shall I confirm?");
    });

    const replies = await runAgentTurn(
      {
        domainDb: fakeDb.db,
        messaging: fakeMessaging.db,
        model,
        now: () => new Date("2026-10-01T08:00:00Z"),
      },
      conversation.id,
    );

    expect(replies).toHaveLength(1);
    expect(replies[0].type).toBe("buttons");
    if (replies[0].type === "buttons") {
      expect(
        replies[0].interactive.action.buttons.map((b) => b.reply.id),
      ).toEqual(["confirm_booking", "change_details", "cancel_booking"]);
    }
  });

  it("persists conversation.state across the turn", async () => {
    const { fakeDb, fakeMessaging, conversation } = await setUp([
      { direction: "INBOUND", body: "Hi" },
      { direction: "OUTBOUND", body: "Welcome!" },
      { direction: "INBOUND", body: "Book the Vitz please" },
    ]);
    await runAgentTurn(
      deps(fakeDb, fakeMessaging, [
        toolUseMessage([
          {
            id: "call_1",
            name: "start_or_update_booking_draft",
            input: { vehicleId: VEHICLE_VITZ.id },
          },
        ]),
        textMessage("Great choice — what dates?"),
      ]),
      conversation.id,
    );

    const updated = await fakeMessaging.db.getConversationById(conversation.id);
    expect(typeof updated?.state.draftBookingId).toBe("string");
  });
});

describe("runAgentTurn: failure handling", () => {
  it("escalates to a human and returns a fallback reply when the tool-call cap is exceeded", async () => {
    const { fakeDb, fakeMessaging, conversation } = await setUp([
      { direction: "INBOUND", body: "Hi" },
      { direction: "OUTBOUND", body: "Welcome!" },
      { direction: "INBOUND", body: "Loop forever" },
    ]);
    const infiniteToolLoop = Array.from({ length: 8 }, (_, i) =>
      toolUseMessage([{ id: `call_${i}`, name: "get_fleet", input: {} }]),
    );
    const replies = await runAgentTurn(
      deps(fakeDb, fakeMessaging, infiniteToolLoop),
      conversation.id,
    );

    expect(replies).toHaveLength(1);
    expect(replies[0].type).toBe("text");
    const updated = await fakeMessaging.db.getConversationById(conversation.id);
    expect(updated?.mode).toBe("HUMAN");
    expect(fakeMessaging.notifications).toContainEqual(
      expect.objectContaining({ type: "NEEDS_HUMAN" }),
    );
  });

  it("escalates to a human and returns a fallback reply when the model call throws", async () => {
    const { fakeDb, fakeMessaging, conversation } = await setUp([
      { direction: "INBOUND", body: "Hi" },
      { direction: "OUTBOUND", body: "Welcome!" },
      { direction: "INBOUND", body: "Trigger an error" },
    ]);
    const failingDeps: AgentDeps = {
      domainDb: fakeDb.db,
      messaging: fakeMessaging.db,
      model: {
        async createMessage() {
          throw new Error("network blip");
        },
      },
      now: () => new Date("2026-10-01T08:00:00Z"),
    };

    const replies = await runAgentTurn(failingDeps, conversation.id);

    expect(replies).toHaveLength(1);
    expect(replies[0].type).toBe("text");
    const updated = await fakeMessaging.db.getConversationById(conversation.id);
    expect(updated?.mode).toBe("HUMAN");
  });
});

describe("buildMessageHistory", () => {
  it("collapses consecutive same-role messages so roles alternate", () => {
    const messages: MessageRow[] = [
      {
        id: "1",
        direction: "INBOUND",
        sender: "customer",
        body: "Hi",
        createdAt: "",
      },
      {
        id: "2",
        direction: "OUTBOUND",
        sender: "ai",
        body: "Hello",
        createdAt: "",
      },
      {
        id: "3",
        direction: "OUTBOUND",
        sender: "owner",
        body: "Owner chiming in",
        createdAt: "",
      },
      {
        id: "4",
        direction: "INBOUND",
        sender: "customer",
        body: "Thanks",
        createdAt: "",
      },
    ];
    const history = buildMessageHistory(messages);
    expect(history.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(history[1].content).toBe("Hello\nOwner chiming in");
  });

  it("drops a leading assistant-only message so history starts with user", () => {
    const messages: MessageRow[] = [
      {
        id: "1",
        direction: "OUTBOUND",
        sender: "ai",
        body: "orphaned",
        createdAt: "",
      },
      {
        id: "2",
        direction: "INBOUND",
        sender: "customer",
        body: "Hi",
        createdAt: "",
      },
    ];
    const history = buildMessageHistory(messages);
    expect(history).toEqual([{ role: "user", content: "Hi" }]);
  });
});
