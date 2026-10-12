import { describe, expect, it } from "vitest";
import { createBotHarness, textOf } from "./testing/harness";
import type { BotCatalog } from "./ports";

async function withSearch(
  hits: { id: string; score: number }[],
  cfg: Partial<{ faqMinScore: number; faqMargin: number }> = {},
) {
  const h = await createBotHarness({ llm: "forbidden" });
  const base = h.deps.catalog;
  const catalog: BotCatalog = { ...base, searchKnowledge: async () => hits };
  h.deps.catalog = catalog;
  h.deps.config = { ...h.deps.config!, ...cfg };
  return h;
}

describe("FAQ full-text search threshold and margin", () => {
  it("replies verbatim when the top hit clears the score and leads by the margin", async () => {
    const h = await withSearch([
      { id: "kb-cancel", score: 0.8 },
      { id: "kb-hours", score: 0.2 },
    ]);
    const r = await h.send("hmm tell me about getting my money back");
    expect(r.handledBy).toBe("faq");
    expect(textOf(r.replies)).toBe(
      "You can cancel free of charge up to 24 hours before pickup.",
    );
  });

  it("stays silent when the top score is below the threshold", async () => {
    const h = await withSearch([{ id: "kb-cancel", score: 0.2 }]);
    const r = await h.send("tell me about getting my money back");
    expect(r.handledBy).toBe("llm_fallback");
  });

  it("stays silent when two hits are too close (no clear winner)", async () => {
    const h = await withSearch([
      { id: "kb-cancel", score: 0.6 },
      { id: "kb-hours", score: 0.55 },
    ]);
    const r = await h.send("tell me about getting my money back");
    expect(r.handledBy).toBe("llm_fallback");
  });

  it("threshold and margin are configurable", async () => {
    const hits = [
      { id: "kb-cancel", score: 0.2 },
      { id: "kb-hours", score: 0.15 },
    ];
    const h = await withSearch(hits, { faqMinScore: 0.1, faqMargin: 0.01 });
    expect(
      (await h.send("tell me about getting my money back")).handledBy,
    ).toBe("faq");
  });

  it("a single word never triggers a full-text answer", async () => {
    const h = await withSearch([{ id: "kb-cancel", score: 0.99 }]);
    expect((await h.send("money")).handledBy).not.toBe("faq");
  });
});

describe("FAQ keyword rules", () => {
  it("use the knowledge-base row's own keywords", async () => {
    const h = await createBotHarness({ llm: "forbidden" });
    const r = await h.send("can I pay by card");
    expect(r.trace.matched).toContain("faq");
    expect(textOf(r.replies)).toMatch(/only accept cash/);
  });
});
