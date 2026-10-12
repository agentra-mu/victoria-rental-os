import { normalize, similarity, tokens } from "../text";

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "i",
  "me",
  "my",
  "to",
  "of",
  "at",
  "in",
  "for",
  "and",
  "or",
  "is",
  "it",
  "ll",
  "m",
  "d",
  "want",
  "take",
  "like",
  "would",
  "need",
  "rent",
  "hire",
  "book",
  "please",
  "pls",
  "thanks",
  "thank",
  "you",
  "with",
  "from",
  "pick",
  "pickup",
  "drop",
  "dropoff",
  "off",
  "up",
  "car",
  "choose",
  "select",
  "go",
  "will",
  "can",
  "get",
  "have",
  "one",
  "that",
  "this",
  "je",
  "veux",
  "voudrais",
  "prends",
  "prendre",
  "la",
  "le",
  "les",
  "un",
  "une",
  "des",
  "du",
  "de",
  "au",
  "aux",
  "a",
  "en",
  "et",
  "ou",
  "svp",
  "merci",
  "mon",
  "ma",
  "pour",
  "louer",
  "voiture",
  "choisis",
  "choisir",
  "prise",
  "retrait",
  "depose",
  "lieu",
]);

export interface Candidate {
  id: string;
  names: string[];
}

export interface Ranked {
  id: string;
  score: number;
}

const TOKEN_MIN_SIM = 0.75;

function tokenSim(a: string, b: string): number {
  if (a === b) return 1;
  // Fuzzy only on longer words: "swift"≈"swfit", but "suv" must match exactly.
  if (a.length < 4 || b.length < 4) return 0;
  const s = similarity(a, b);
  return s >= TOKEN_MIN_SIM ? s : 0;
}

/** Score of one candidate name against the (stop-word-free) query tokens. */
export function scoreName(queryTokens: string[], name: string): number {
  const nameTokens = tokens(name);
  if (nameTokens.length === 0 || queryTokens.length === 0) return 0;

  const best = (t: string, pool: string[]) =>
    Math.max(0, ...pool.map((p) => tokenSim(t, p)));

  // Every word of the name appears in the message ("the toyota vitz please").
  const coverage =
    nameTokens.reduce((sum, t) => sum + best(t, queryTokens), 0) /
    nameTokens.length;

  // Every word of the message appears in the name ("vitz" ⊂ "toyota vitz") — a little less certain.
  const queryHits = queryTokens.map((t) => best(t, nameTokens));
  const contained = queryHits.every((s) => s > 0)
    ? 0.85 * (queryHits.reduce((a, b) => a + b, 0) / queryHits.length)
    : 0;

  return Math.max(coverage, contained);
}

export function queryTokens(text: string): string[] {
  return tokens(text).filter((t) => !STOPWORDS.has(t));
}

export function rank(text: string, candidates: Candidate[]): Ranked[] {
  const q = queryTokens(normalize(text));
  return candidates
    .map((c) => ({
      id: c.id,
      score: Math.max(0, ...c.names.map((n) => scoreName(q, n))),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

export type Pick =
  | { kind: "match"; id: string; score: number }
  | { kind: "ambiguous"; ids: string[] }
  | { kind: "none" };

/** Top match if it clears `threshold` and leads by `margin`; otherwise the tied front-runners. */
export function pick(
  ranked: Ranked[],
  threshold: number,
  margin: number,
): Pick {
  const top = ranked[0];
  if (!top || top.score < threshold) return { kind: "none" };
  const contenders = ranked.filter(
    (r) => r.score >= threshold && top.score - r.score < margin,
  );
  if (contenders.length === 1)
    return { kind: "match", id: top.id, score: top.score };
  return { kind: "ambiguous", ids: contenders.map((c) => c.id) };
}
