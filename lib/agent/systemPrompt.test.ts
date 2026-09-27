import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./systemPrompt";
import { loadAgentContext } from "./context";
import { createAgentFixture } from "./testing/fixtures";

async function buildPrompt() {
  const { fakeDb, fakeMessaging } = createAgentFixture();
  const customer = await fakeMessaging.db.findOrCreateCustomer("+23057611111");
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
  return buildSystemPrompt(context);
}

describe("buildSystemPrompt", () => {
  it("enforces the cash-only, never-mark-paid rule", async () => {
    const prompt = await buildPrompt();
    expect(prompt).toMatch(/cash only/i);
    expect(prompt).toMatch(/never say a payment has been received/i);
  });

  it("enforces the documents-verified rule", async () => {
    const prompt = await buildPrompt();
    expect(prompt).toMatch(/VERIFIED/);
  });

  it("lists the escalation triggers", async () => {
    const prompt = await buildPrompt();
    expect(prompt).toMatch(/accidents or damage/i);
    expect(prompt).toMatch(/escalate_to_human/);
  });

  it("forbids revealing internal ids", async () => {
    const prompt = await buildPrompt();
    expect(prompt).toMatch(/never reveal internal database ids/i);
  });

  it("includes the customer's code and the knowledge base", async () => {
    const prompt = await buildPrompt();
    expect(prompt).toMatch(/CUST-/);
    expect(prompt).toMatch(/credit cards/i);
  });
});
