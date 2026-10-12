/** Tunables for the deterministic bot. Every knob has an env override; see MIGRATION_NOTES.md. */
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const COMPANY_NAME = "Victoria Car Rental";

export interface BotConfig {
  /** Re-prompts allowed per step before the "stuck" buttons appear (then a human). */
  maxReprompts: number;
  /** Fuzzy car/location match: minimum similarity 0..1. */
  fuzzyThreshold: number;
  /** Two matches closer than this are "ambiguous" and the customer picks from a list. */
  fuzzyMargin: number;
  /** FTS: minimum normalised rank of the top hit. */
  faqMinScore: number;
  /** FTS: required lead of the top hit over the second. */
  faqMargin: number;
  /** Consecutive unrecognised turns before NEEDS_HUMAN. */
  unknownStreakLimit: number;
  /** Reject a name with more words than this. */
  nameMaxTokens: number;
}

export function loadBotConfig(): BotConfig {
  return {
    maxReprompts: num("BOT_MAX_REPROMPTS", 2),
    fuzzyThreshold: num("BOT_FUZZY_THRESHOLD", 0.8),
    fuzzyMargin: num("BOT_FUZZY_MARGIN", 0.1),
    faqMinScore: num("BOT_FAQ_MIN_SCORE", 0.3),
    faqMargin: num("BOT_FAQ_MARGIN", 0.1),
    unknownStreakLimit: num("BOT_UNKNOWN_STREAK_LIMIT", 2),
    nameMaxTokens: num("BOT_NAME_MAX_TOKENS", 5),
  };
}
