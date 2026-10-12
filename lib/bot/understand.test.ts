import { beforeEach, describe, expect, it } from "vitest";
import { clearLlmCache } from "@/lib/llm/guard";
import { createBotHarness, idsOf, textOf } from "./testing/harness";

beforeEach(() => clearLlmCache());

const reply = (extracted: object, intent = "view_cars", language = "en") => ({
  intent,
  extracted,
  language,
  confidence: 0.9,
});

describe("understanding free-form messages with the model enabled", () => {
  it("one sentence fills several steps, then asks only for what's missing", async () => {
    const h = await createBotHarness({ llm: "mock" });
    h.provider!.enqueue(
      reply({
        car: "Vitz",
        pickup_datetime: "tomorrow 9am",
        duration: "3 days",
        pickup_location: "the airport",
      }),
    );
    const r = await h.send(
      "Hey, could I get the Vitz from tomorrow at 9am for 3 days, collecting at the airport",
    );
    expect(r.handledBy).toBe("llm_fallback");
    expect(h.llmCalls()).toBe(1);
    const text = textOf(r.replies);
    expect(text).toMatch(/Got it ✅/);
    expect(text).toMatch(/Toyota Vitz/);
    expect(h.state().step).toBe("DROPOFF_LOCATION");
    expect(h.state().vehicleId).toBe("veh-vitz");
    const [draft] = h.bookings();
    expect(draft.pickupAt).toBe("2026-10-13T05:00:00.000Z");
    expect(draft.returnAt).toBe("2026-10-16T05:00:00.000Z");
    expect(draft.pickupLocationId).toBe("loc-airport");
  });

  it("dates without a car start with availability", async () => {
    const h = await createBotHarness({ llm: "mock" });
    h.provider!.enqueue(
      reply(
        { pickup_datetime: "15 Oct 10am", return_datetime: "19 Oct 10am" },
        "check_availability",
      ),
    );
    const r = await h.send(
      "anything free from the 15th to the 19th of October at ten in the morning?",
    );
    expect(idsOf(r.replies)).toEqual([
      "car:veh-vitz",
      "car:veh-swift",
      "car:veh-vitara",
    ]);
    expect(h.state().step).toBe("CHOOSE_CAR");
  });

  it("a vague answer inside a booking step is understood and moves on", async () => {
    const h = await createBotHarness({ llm: "mock" });
    await h.send({ replyId: "menu:view_cars" });
    await h.send({ replyId: "car:veh-vitz" });
    h.provider!.enqueue(reply({ pickup_datetime: "15 Oct 9am" }, "unknown"));
    const r = await h.send("whenever my flight lands I suppose");
    expect(h.llmCalls()).toBe(1);
    expect(r.handledBy).toBe("llm_fallback");
    expect(h.state().step).toBe("RETURN_DATETIME");
    expect(h.state().pending.pickupDate).toBe("2026-10-15");
  });

  it("the model's language is used for the reply", async () => {
    const h = await createBotHarness({ llm: "mock" });
    h.provider!.enqueue(reply({ car: "Vitz" }, "view_cars", "fr"));
    const r = await h.send("kiero el coche pequeño, la vitz");
    expect(textOf(r.replies)).toMatch(/Excellent choix|Bien noté/);
  });

  it("anything the model extracts that the parsers reject is dropped", async () => {
    const h = await createBotHarness({ llm: "mock" });
    h.provider!.enqueue(
      reply({ car: "spaceship", pickup_datetime: "yesterday-ish" }),
    );
    await h.send("something something rocket please now");
    expect(h.state().vehicleId).toBeUndefined();
    expect(h.bookings()).toHaveLength(0);
  });

  it("is not consulted for 'valid but not allowed' failures like a past date", async () => {
    const h = await createBotHarness({ llm: "mock" });
    await h.send({ replyId: "menu:view_cars" });
    await h.send({ replyId: "car:veh-vitz" });
    await h.send("1 January 2020");
    expect(h.llmCalls()).toBe(0);
  });

  it("with the model off the same sentence still works as a plain 'view cars'", async () => {
    const h = await createBotHarness({ llm: "disabled" });
    const r = await h.send(
      "could I get the Vitz from tomorrow at 9am for 3 days from the airport",
    );
    expect(h.llmCalls()).toBe(0);
    expect(r.handledBy).not.toBe("llm_fallback");
  });
});
