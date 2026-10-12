import { describe, expect, it } from "vitest";
import { computeBotMetrics, type TurnRow } from "./botMetrics";

let n = 0;
const turn = (o: Partial<TurnRow> = {}): TurnRow => ({
  conversation_id: "c1",
  layer: "state_machine",
  total_ms: 100,
  llm_calls: 0,
  unrecognised: false,
  inbound_text: null,
  booking_confirmed: false,
  created_at: new Date(Date.UTC(2026, 9, 12, 8, 0, n++)).toISOString(),
  ...o,
});

describe("computeBotMetrics", () => {
  it("handles no data", () => {
    expect(computeBotMetrics([], [])).toMatchObject({
      turns: 0,
      pctWithoutLlm: null,
      avgTurnMs: null,
    });
  });

  it("% of turns without an LLM, latency and layers", () => {
    const m = computeBotMetrics(
      [
        turn({ total_ms: 50 }),
        turn({ total_ms: 150, layer: "faq" }),
        turn({ total_ms: 250, layer: "llm_fallback", llm_calls: 1 }),
        turn({ total_ms: 50 }),
      ],
      [],
    );
    expect(m.pctWithoutLlm).toBe(75);
    expect(m.avgTurnMs).toBe(125);
    expect(m.p95TurnMs).toBe(250);
    expect(m.byLayer[0]).toEqual({ layer: "state_machine", turns: 2 });
  });

  it("% of bookings completed with zero LLM calls (per conversation flow)", () => {
    const m = computeBotMetrics(
      [
        turn({ conversation_id: "a" }),
        turn({ conversation_id: "a", booking_confirmed: true }), // clean booking
        turn({ conversation_id: "b" }),
        turn({ conversation_id: "b", llm_calls: 1, layer: "llm_fallback" }),
        turn({ conversation_id: "b", booking_confirmed: true }), // used the LLM on the way
        turn({ conversation_id: "a" }), // a's next booking starts clean
        turn({ conversation_id: "a", booking_confirmed: true }),
      ],
      [],
    );
    expect(m.bookingsConfirmed).toBe(3);
    expect(m.pctBookingsWithoutLlm).toBe(66.7);
  });

  it("fallback calls per day and top unrecognised phrases", () => {
    const m = computeBotMetrics(
      [
        turn({ unrecognised: true, inbound_text: "Do you rent boats?" }),
        turn({ unrecognised: true, inbound_text: "do you rent  BOATS?" }),
        turn({ unrecognised: true, inbound_text: "zzz" }),
        turn(),
      ],
      [
        {
          purpose: "classify",
          created_at: "2026-10-12T08:00:00Z",
          latency_ms: 300,
        },
        {
          purpose: "kb_answer",
          created_at: "2026-10-12T09:00:00Z",
          latency_ms: 300,
        },
        {
          purpose: "classify",
          created_at: "2026-10-13T09:00:00Z",
          latency_ms: 300,
        },
      ],
    );
    expect(m.unrecognised).toBe(3);
    expect(m.topUnrecognised[0]).toEqual({
      phrase: "do you rent boats?",
      count: 2,
    });
    expect(m.fallbackPerDay).toEqual([
      { day: "2026-10-12", calls: 2 },
      { day: "2026-10-13", calls: 1 },
    ]);
  });
});
