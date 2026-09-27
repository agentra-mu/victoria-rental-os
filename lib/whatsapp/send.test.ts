import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendButtonsMessage,
  sendListMessage,
  sendTemplateMessage,
  sendTextMessage,
  WhatsAppSendError,
} from "./send";
import { createFakeMessagingDb } from "./testing/fakeMessagingDb";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeContext() {
  const messaging = createFakeMessagingDb();
  return {
    ctx: {
      messaging: messaging.db,
      conversationId: "conv-1",
      sender: "owner" as const,
    },
    messaging,
  };
}

describe("send.ts", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends a text message, strips the leading + from the phone number, and stores it", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse({ messages: [{ id: "wamid.out.1" }] }),
    );

    const { ctx, messaging } = makeContext();
    const messageId = await sendTextMessage(ctx, "+23057611111", "Hello there");

    expect(messageId).toBe("wamid.out.1");
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      to: "23057611111",
      type: "text",
      text: { body: "Hello there" },
    });
    expect(init!.headers).toMatchObject({ Authorization: "Bearer test-token" });

    expect(messaging.messages).toEqual([
      expect.objectContaining({
        conversationId: "conv-1",
        direction: "OUTBOUND",
        sender: "owner",
        body: "Hello there",
        whatsappMessageId: "wamid.out.1",
      }),
    ]);
  });

  it("sends an interactive buttons message built from format.ts", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse({ messages: [{ id: "wamid.out.2" }] }),
    );

    const { ctx } = makeContext();
    await sendButtonsMessage(ctx, "+23057611111", "Confirm?", [
      { id: "yes", title: "Yes" },
      { id: "no", title: "No" },
    ]);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.type).toBe("interactive");
    expect(body.interactive).toMatchObject({
      type: "button",
      body: { text: "Confirm?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "yes", title: "Yes" } },
          { type: "reply", reply: { id: "no", title: "No" } },
        ],
      },
    });
  });

  it("sends an interactive list message built from format.ts", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse({ messages: [{ id: "wamid.out.3" }] }),
    );

    const { ctx } = makeContext();
    await sendListMessage(ctx, "+23057611111", "Pick a car", "See options", [
      { id: "v1", title: "Toyota Vitz" },
    ]);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.interactive.type).toBe("list");
    expect(body.interactive.action.sections[0].rows).toEqual([
      { id: "v1", title: "Toyota Vitz" },
    ]);
  });

  it("sends a template message with components", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse({ messages: [{ id: "wamid.out.4" }] }),
    );

    const { ctx, messaging } = makeContext();
    await sendTemplateMessage(ctx, "+23057611111", "booking_reminder", "en", [
      { type: "body", parameters: [{ type: "text", text: "tomorrow" }] },
    ]);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.type).toBe("template");
    expect(body.template).toMatchObject({
      name: "booking_reminder",
      language: { code: "en" },
    });
    expect(messaging.messages[0].body).toBe("[template: booking_reminder]");
  });

  it("maps Meta's 24h-window error code to WhatsAppSendError with OUTSIDE_24H_WINDOW", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: "Re-engagement message", code: 131047 } },
        400,
      ),
    );

    const { ctx } = makeContext();
    await expect(
      sendTextMessage(ctx, "+23057611111", "hi"),
    ).rejects.toMatchObject({
      code: "OUTSIDE_24H_WINDOW",
    });
  });

  it("maps any other Graph API error to SEND_FAILED, preserving Meta's message", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: "Invalid phone number", code: 100 } },
        400,
      ),
    );

    const { ctx } = makeContext();
    let caught: unknown;
    try {
      await sendTextMessage(ctx, "+23057611111", "hi");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WhatsAppSendError);
    expect((caught as WhatsAppSendError).code).toBe("SEND_FAILED");
    expect((caught as WhatsAppSendError).message).toBe("Invalid phone number");
  });

  it("does not store a message when the send fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: "boom", code: 1 } }, 500),
    );

    const { ctx, messaging } = makeContext();
    await expect(sendTextMessage(ctx, "+23057611111", "hi")).rejects.toThrow();
    expect(messaging.messages).toHaveLength(0);
  });
});
