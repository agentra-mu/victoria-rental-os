import { describe, expect, it } from "vitest";
import { listAllKnowledgeBase, searchKnowledgeBase } from "./knowledgeBase";
import { createFakeDb } from "./testing/fakeDb";
import { knowledgeBaseEntry } from "./testing/fixtures";

describe("searchKnowledgeBase", () => {
  it("returns the best-matching entries for a query", async () => {
    const { db } = createFakeDb({
      knowledgeBase: [
        knowledgeBaseEntry({
          id: "k1",
          topic: "payment",
          question: "How do I pay?",
          answer: "Cash only.",
        }),
        knowledgeBaseEntry({
          id: "k2",
          topic: "hours",
          question: "What are your hours?",
          answer: "8-6 daily.",
        }),
      ],
    });
    const results = await searchKnowledgeBase(db, "pay");
    expect(results.map((r) => r.id)).toEqual(["k1"]);
  });

  it("returns an empty array for a blank query without touching the database", async () => {
    const { db } = createFakeDb({
      knowledgeBase: [knowledgeBaseEntry({ id: "k1" })],
    });
    expect(await searchKnowledgeBase(db, "   ")).toEqual([]);
  });
});

describe("listAllKnowledgeBase", () => {
  it("returns every active entry", async () => {
    const { db } = createFakeDb({
      knowledgeBase: [
        knowledgeBaseEntry({ id: "k1" }),
        knowledgeBaseEntry({ id: "k2" }),
      ],
    });
    const all = await listAllKnowledgeBase(db);
    expect(all).toHaveLength(2);
  });
});
