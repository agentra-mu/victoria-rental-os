import { describe, expect, it } from "vitest";
import {
  matchCommand,
  matchFaqIntent,
  matchIntent,
  looksLikeQuestion,
} from "./lexicon";
import { containsPhrase, normalize, similarity } from "./text";

describe("normalize", () => {
  it("is case- and accent-insensitive", () => {
    expect(normalize("  Où ÊTES-vous ?? ")).toBe("ou etes-vous");
    expect(normalize("D’ACCORD")).toBe("d'accord");
  });
  it("matches phrases on word boundaries only", () => {
    expect(containsPhrase(normalize("cancellation policy"), "cancel")).toBe(
      false,
    );
    expect(containsPhrase(normalize("please cancel it"), "cancel")).toBe(true);
  });
  it("similarity", () => {
    expect(similarity("swift", "swift")).toBe(1);
    expect(similarity("abc", "xyz")).toBe(0);
  });
});

describe("matchCommand", () => {
  it.each([
    ["HUMAN", "human"],
    ["Agent", "human"],
    ["TALK TO SOMEONE", "human"],
    ["I want to talk to someone", "human"],
    ["parler à quelqu'un", "human"],
    ["Je voudrais parler à une personne", "human"],
    ["conseiller", "human"],
    ["MENU", "menu"],
    ["Menu principal", "menu"],
    ["CANCEL", "cancel"],
    ["Annuler", "cancel"],
    ["stop", "stop"],
    ["BACK", "back"],
    ["retour", "back"],
    ["CHANGE", "change"],
    ["modifier", "change"],
    ["YES", "yes"],
    ["Oui", "yes"],
    ["d'accord", "yes"],
    ["NON", "no"],
    ["no", "no"],
    ["Bonjour", "greeting"],
    ["hello", "greeting"],
    ["merci", "thanks"],
  ])("%s → %s", (text, name) => {
    expect(matchCommand(text)?.name).toBe(name);
  });

  it("doesn't fire on ordinary sentences", () => {
    expect(matchCommand("what is your cancellation policy")).toBeNull();
    expect(matchCommand("do you have a menu of cars")).toBeNull();
    expect(matchCommand("I'd like the back seat to fold")).toBeNull();
    expect(matchCommand("tomorrow 9am")).toBeNull();
    expect(matchCommand("start my rental on friday")).toBeNull();
  });
});

describe("matchIntent / matchFaqIntent", () => {
  it.each([
    ["I will be late", "delay"],
    ["je serai en retard", "delay"],
    ["I want to extend my rental", "extension"],
    ["je voudrais prolonger", "extension"],
    ["change the pickup time please", "pickup_change"],
    ["I already paid", "payment_claim"],
    ["j'ai déjà payé", "payment_claim"],
    ["I had an accident", "incident"],
    ["show me your cars", "view_cars"],
    ["my booking status", "existing_booking"],
  ])("intent %s → %s", (text, intent) => {
    expect(matchIntent(text)).toBe(intent);
  });

  it.each([
    ["Do you accept credit cards?", "payment_methods"],
    ["What are your opening hours?", "opening_hours"],
    ["quels documents faut-il ?", "documents_required"],
    ["Is there a mileage limit?", "mileage"],
    ["Where is your office? I need directions", "address"],
    ["What is the fuel policy", "fuel"],
    ["Is a deposit required", "deposit"],
    ["what happens if I return the car late", "late_return"],
    ["can I get a refund", "cancellation"],
  ])("faq %s → %s", (text, key) => {
    expect(matchFaqIntent(text)).toBe(key);
  });
});

describe("looksLikeQuestion", () => {
  it("detects questions in English and French", () => {
    expect(looksLikeQuestion("how old must I be")).toBe(true);
    expect(looksLikeQuestion("quels sont vos tarifs")).toBe(true);
    expect(looksLikeQuestion("Jean Baptiste")).toBe(false);
    expect(looksLikeQuestion("airport?")).toBe(true);
  });
});
