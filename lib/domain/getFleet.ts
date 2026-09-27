import { DomainError } from "./errors";
import type { DomainDb } from "./ports";

export interface GetFleetArgs {
  pickupAt?: Date | string;
  returnAt?: Date | string;
}

/** One row per distinct model/trim the AI or dashboard can present. */
export interface FleetGroup {
  categoryId: string;
  categoryName: string;
  make: string;
  model: string;
  dailyPriceRs: number;
  transmission: string | null;
  seats: number | null;
  photoUrl: string | null;
  total: number;
  /** Only present when pickupAt/returnAt were given. */
  available?: number;
  /** Physical vehicle ids — kept internal, never shown to the customer. */
  vehicleIds: string[];
}

/** Fleet grouped by model, with category/price/transmission/seats/photo and (if dates given) live availability. */
export async function getFleet(
  db: DomainDb,
  args: GetFleetArgs = {},
): Promise<FleetGroup[]> {
  const hasPickup = args.pickupAt !== undefined;
  const hasReturn = args.returnAt !== undefined;
  if (hasPickup !== hasReturn) {
    throw new DomainError(
      "INVALID_DATES",
      "Provide both pickupAt and returnAt, or neither",
    );
  }

  let pickupAt: Date | undefined;
  let returnAt: Date | undefined;
  if (hasPickup && hasReturn) {
    pickupAt = new Date(args.pickupAt!);
    returnAt = new Date(args.returnAt!);
    if (returnAt.getTime() <= pickupAt.getTime()) {
      throw new DomainError(
        "INVALID_DATES",
        "Return date must be after pickup date",
      );
    }
  }

  const [vehicles, categories] = await Promise.all([
    db.listActiveVehicles({}),
    db.listVehicleCategories(),
  ]);
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  const unavailable =
    pickupAt && returnAt
      ? await db.findOverlappingVehicleIds({
          vehicleIds: vehicles.map((v) => v.id),
          pickupAt,
          returnAt,
        })
      : undefined;

  const groups = new Map<string, FleetGroup>();
  for (const vehicle of vehicles) {
    const key = [
      vehicle.make,
      vehicle.model,
      vehicle.dailyPriceRs,
      vehicle.transmission,
      vehicle.seats,
    ].join("::");
    let group = groups.get(key);
    if (!group) {
      group = {
        categoryId: vehicle.categoryId,
        categoryName: categoryNames.get(vehicle.categoryId) ?? "Uncategorized",
        make: vehicle.make,
        model: vehicle.model,
        dailyPriceRs: vehicle.dailyPriceRs,
        transmission: vehicle.transmission,
        seats: vehicle.seats,
        photoUrl: vehicle.photoUrl,
        total: 0,
        vehicleIds: [],
        ...(unavailable ? { available: 0 } : {}),
      };
      groups.set(key, group);
    }
    group.total += 1;
    group.vehicleIds.push(vehicle.id);
    if (
      unavailable &&
      group.available !== undefined &&
      !unavailable.has(vehicle.id)
    ) {
      group.available += 1;
    }
  }

  return Array.from(groups.values());
}
