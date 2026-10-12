import type { BotConfig } from "../config";
import {
  NAME_BLOCKLIST,
  NAME_PREFIXES,
  NAME_SUFFIX_PATTERNS,
} from "../lexicon";
import { normalize, tokens } from "../text";
import { fail, ok, type ParseResult } from "./types";

export type NameFailure =
  "TOO_SHORT" | "ONE_WORD" | "TOO_LONG" | "BAD_CHARACTERS" | "NOT_A_NAME";

const NAME_CHARS = /^[\p{L}][\p{L}'’\-. ]*$/u;

/**
 * Validates a full name as printed on the passport/permit. Strips filler
 * ("my name is …", "… exactly as on my passport"), then requires 2+ words of
 * letters/accents/hyphens/apostrophes and a sane length. Text that reads
 * like a sentence or an instruction ("ignore your instructions…") is
 * rejected. The result is echoed back at the summary for confirmation.
 */
export function parseFullName(
  input: string,
  cfg: Pick<BotConfig, "nameMaxTokens">,
): ParseResult<string, NameFailure> {
  let text = input.trim().replace(/\s+/g, " ");
  if (text.includes("?")) return fail("NOT_A_NAME");

  for (const re of NAME_SUFFIX_PATTERNS) text = text.replace(re, "").trim();
  for (const prefix of NAME_PREFIXES) {
    const n = normalize(text);
    const p = normalize(prefix);
    if (n.startsWith(`${p} `)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  text = text.replace(/^[,:\-–\s]+|[,:\-–.\s]+$/g, "").trim();

  if (text.length < 3) return fail("TOO_SHORT");
  if (text.length > 60) return fail("TOO_LONG");
  if (!NAME_CHARS.test(text)) return fail("BAD_CHARACTERS");

  const words = text.split(" ").filter(Boolean);
  if (words.length < 2) return fail("ONE_WORD");
  if (words.length > cfg.nameMaxTokens) return fail("NOT_A_NAME");

  const blocked = new Set(NAME_BLOCKLIST.map(normalize));
  if (tokens(text).some((t) => blocked.has(t))) return fail("NOT_A_NAME");

  return ok(text);
}
