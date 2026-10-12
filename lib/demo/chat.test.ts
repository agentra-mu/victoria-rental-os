import { describe, expect, it } from "vitest";
import { createAgentFixture } from "@/lib/agent/testing/fixtures";
import { handleDemoInbound, handleDemoOutbound } from "./chat";

const NOW = new Date("2026-10-11T10:30:00Z"); // 14:30 Sunday in Mauritius

function setup() {
  const { fakeDb, fakeMessaging } = createAgentFixture();
  const deps = {
    domainDb: fakeDb.db,
    messaging: fakeMessaging.db,
    now: () => NOW,
  };
  return { deps, fakeMessaging };
}

const msg = (text: string, id = "m1") => ({
  whatsappNumber: "+23057000001",
  text,
  messageId: id,
});

describe("handleDemoInbound", () => {
  it("creates the customer, stores the message and tells n8n to run the AI", async () => {
    const { deps, fakeMessaging } = setup();
    const r = await handleDemoInbound(deps, msg("Hi"));
    expect(r).toMatchObject({
      skipAgent: false,
      mode: "AI",
      duplicate: false,
      isFirstContact: true,
    });
    expect(r.today).toContain("Sunday, 11 October 2026 at 14:30");
    expect(r.today).toContain("Indian/Mauritius");
    expect(fakeMessaging.messages).toEqual([
      expect.objectContaining({ sender: "customer", body: "Hi" }),
    ]);
  });

  it("is not first contact on the second message", async () => {
    const { deps } = setup();
    await handleDemoInbound(deps, msg("Hi", "m1"));
    const r = await handleDemoInbound(deps, msg("Cars?", "m2"));
    expect(r.isFirstContact).toBe(false);
  });

  it("dedupes a redelivered message id without storing it twice", async () => {
    const { deps, fakeMessaging } = setup();
    await handleDemoInbound(deps, msg("Hi"));
    const r = await handleDemoInbound(deps, msg("Hi"));
    expect(r).toMatchObject({ skipAgent: true, duplicate: true });
    expect(fakeMessaging.messages).toHaveLength(1);
  });

  it("'human' hands over: mode HUMAN, stored reply returned, AI skipped", async () => {
    const { deps, fakeMessaging } = setup();
    const r = await handleDemoInbound(deps, msg("human"));
    expect(r.skipAgent).toBe(true);
    expect(r.mode).toBe("HUMAN");
    expect(r.systemReply).toMatch(/team/i);
    expect(fakeMessaging.notifications).toHaveLength(1);
  });

  it("while in HUMAN mode later messages are stored but the AI is skipped", async () => {
    const { deps, fakeMessaging } = setup();
    await handleDemoInbound(deps, msg("human", "m1"));
    const r = await handleDemoInbound(deps, msg("hello?", "m2"));
    expect(r).toMatchObject({ skipAgent: true, mode: "HUMAN" });
    expect(fakeMessaging.messages.some((m) => m.body === "hello?")).toBe(true);
  });
});

describe("handleDemoOutbound", () => {
  it("stores the AI reply as an outbound ai message", async () => {
    const { deps, fakeMessaging } = setup();
    await handleDemoInbound(deps, msg("Hi"));
    await handleDemoOutbound(deps, {
      whatsappNumber: "+23057000001",
      text: "Hello! How can I help?",
    });
    expect(fakeMessaging.messages.at(-1)).toMatchObject({
      direction: "OUTBOUND",
      sender: "ai",
      body: "Hello! How can I help?",
    });
  });
});
