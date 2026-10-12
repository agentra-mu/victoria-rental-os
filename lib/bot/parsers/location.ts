import type { LocationRow } from "@/lib/domain/ports";
import type { BotConfig } from "../config";
import { pick, rank } from "./fuzzy";
import { fail, ok, type ParseResult } from "./types";

export type LocationFailure = "NO_MATCH" | "AMBIGUOUS";

/** Matches a message against location names and their aliases ("airport", "SSR", "grand bay"). */
export function parseLocation(
  text: string,
  locations: LocationRow[],
  aliases: Record<string, string[]>,
  cfg: Pick<BotConfig, "fuzzyThreshold" | "fuzzyMargin">,
): ParseResult<LocationRow, LocationFailure> {
  const ranked = rank(
    text,
    locations.map((l) => ({
      id: l.id,
      names: [l.name, ...(aliases[l.id] ?? [])],
    })),
  );
  const result = pick(ranked, cfg.fuzzyThreshold, cfg.fuzzyMargin);
  if (result.kind === "none") return fail("NO_MATCH");
  if (result.kind === "ambiguous") {
    return fail("AMBIGUOUS", {
      options: result.ids
        .map((id) => locations.find((l) => l.id === id))
        .filter(Boolean),
    });
  }
  return ok(locations.find((l) => l.id === result.id) as LocationRow);
}
