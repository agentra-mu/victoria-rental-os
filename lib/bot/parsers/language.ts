import { LANG_WORDS } from "../lexicon";
import { normalize, tokens } from "../text";
import type { Lang } from "../types";

const WORDS: Record<Lang, Set<string>> = {
  en: new Set(LANG_WORDS.en.map(normalize)),
  fr: new Set(LANG_WORDS.fr.map(normalize)),
};

export interface Detection {
  lang: Lang;
  /** False when the message had no language signal (the previous language should stand). */
  confident: boolean;
  scores: Record<Lang, number>;
}

/**
 * Lexicon scoring: each known word of a language scores a point; a French
 * accent character adds one. Words common to both languages are left out of
 * the lexicon so they don't tip the balance.
 */
export function detectLanguage(text: string, fallback: Lang = "en"): Detection {
  const scores: Record<Lang, number> = { en: 0, fr: 0 };
  for (const t of tokens(text)) {
    for (const lang of ["en", "fr"] as Lang[]) {
      if (WORDS[lang].has(t)) scores[lang] += 1;
    }
  }
  if (/[éèêëàâçùûôîïœ]/i.test(text)) scores.fr += 1;
  if (scores.en === scores.fr)
    return { lang: fallback, confident: false, scores };
  return { lang: scores.fr > scores.en ? "fr" : "en", confident: true, scores };
}
