import { DomainError } from "./errors";
import type { DomainDb } from "./ports";

export interface GetAvailableVehiclesArgs {
  pickupAt: Date | string;
  returnAt: Date | string;
  categoryId?: string;
  locationId?: string;
}

/** One row per make/model/price the AI or dashboard can offer, e.g. "Toyota Vitz — 3 available". */
export interface AvailableVehicleGroup {
  categoryId: string;
  make: string;
  model: string;
  dailyPriceRs: number;
  available: number;
  /** Physical vehicle ids — kept internal, never shown to the customer. */
  vehicleIds: string[];
}

export async function getAvailableVehicles(
  db: DomainDb,
  args: GetAvailableVehiclesArgs,
): Promise<AvailableVehicleGroup[]> {
  const pickupAt = new Date(args.pickupAt);
  const returnAt = new Date(args.returnAt);

  if (returnAt.getTime() <= pickupAt.getTime()) {
    throw new DomainError(
      "INVALID_DATES",
      "Return date must be after pickup date",
    );
  }

  const candidates = await db.listActiveVehicles({
    categoryId: args.categoryId,
    homeLocationId: args.locationId,
  });
  if (candidates.length === 0) return [];

  const unavailable = await db.findOverlappingVehicleIds({
    vehicleIds: candidates.map((v) => v.id),
    pickupAt,
    returnAt,
  });

  const groups = new Map<string, AvailableVehicleGroup>();
  for (const vehicle of candidates) {
    if (unavailable.has(vehicle.id)) continue;

    const key = `${vehicle.make}::${vehicle.model}::${vehicle.dailyPriceRs}`;
    const existing = groups.get(key);
    if (existing) {
      existing.available += 1;
      existing.vehicleIds.push(vehicle.id);
    } else {
      groups.set(key, {
        categoryId: vehicle.categoryId,
        make: vehicle.make,
        model: vehicle.model,
        dailyPriceRs: vehicle.dailyPriceRs,
        available: 1,
        vehicleIds: [vehicle.id],
      });
    }
  }

  return Array.from(groups.values());
}
