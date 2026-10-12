import type { BotConfig } from "../config";
import { pick, rank } from "./fuzzy";
import { fail, ok, type ParseResult } from "./types";

/** A fleet model as the bot presents it. `id` is one vehicle of the group (what the list-reply id carries). */
export interface CarOption {
  id: string;
  make: string;
  model: string;
  categoryName: string;
  dailyPriceRs: number;
  transmission: string | null;
  seats: number | null;
  available?: number;
}

export interface CarGroupLike {
  vehicleIds: string[];
  make: string;
  model: string;
  dailyPriceRs: number;
  categoryName?: string;
  transmission?: string | null;
  seats?: number | null;
  available?: number;
}

export function toCarOptions(groups: CarGroupLike[]): CarOption[] {
  return groups
    .filter((g) => g.vehicleIds.length > 0)
    .map((g) => ({
      id: g.vehicleIds[0],
      make: g.make,
      model: g.model,
      categoryName: g.categoryName ?? "",
      dailyPriceRs: g.dailyPriceRs,
      transmission: g.transmission ?? null,
      seats: g.seats ?? null,
      available: g.available,
    }));
}

export type CarFailure = "NO_MATCH" | "AMBIGUOUS";

/**
 * Fuzzy-matches a message to a fleet model ("vitz", "the toyota vitz please",
 * "suzuki swfit") or a category ("suv", "economy"). A category or a bare make
 * that covers several models comes back as AMBIGUOUS with the candidates.
 */
export function parseCar(
  text: string,
  options: CarOption[],
  cfg: Pick<BotConfig, "fuzzyThreshold" | "fuzzyMargin">,
): ParseResult<CarOption, CarFailure> {
  const ranked = rank(
    text,
    options.map((o) => ({
      id: o.id,
      names: [
        `${o.make} ${o.model}`,
        ...(o.categoryName ? [o.categoryName] : []),
      ],
    })),
  );
  const result = pick(ranked, cfg.fuzzyThreshold, cfg.fuzzyMargin);
  if (result.kind === "none") return fail("NO_MATCH");
  if (result.kind === "ambiguous") {
    return fail("AMBIGUOUS", {
      options: result.ids
        .map((id) => options.find((o) => o.id === id))
        .filter(Boolean),
    });
  }
  return ok(options.find((o) => o.id === result.id) as CarOption);
}
