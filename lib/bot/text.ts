/** Lower-case, accent-free, punctuation-light form used for every keyword/fuzzy comparison. */
export function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\p{L}\p{N}'@%:/.\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word tokens of a normalised string (apostrophes and hyphens split words: "j'ai" → j, ai). */
export function tokens(input: string): string[] {
  return normalize(input)
    .replace(/['\-.:/]/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** True if `phrase` (already normalised) appears in `text` on word boundaries. */
export function containsPhrase(
  normalizedText: string,
  phrase: string,
): boolean {
  const p = normalize(phrase);
  if (!p) return false;
  const hay = ` ${normalizedText.replace(/['\-.]/g, " ").replace(/\s+/g, " ")} `;
  const needle = ` ${p.replace(/['\-.]/g, " ").replace(/\s+/g, " ")} `;
  // Also accept a plural of the last word ("credit card" ⊂ "credit cards").
  return hay.includes(needle) || hay.includes(`${needle.trimEnd()}s `);
}

/** Damerau–Levenshtein (optimal string alignment): a swapped pair of letters costs 1. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** 1 = identical, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}
