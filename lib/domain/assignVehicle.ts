import { DomainError } from "./errors";

export interface AssignableVehicle {
  id: string;
  currentLocationId: string | null;
  homeLocationId: string | null;
  /** Latest return_at of a past booking, or null if never rented — for least-recently-used. */
  lastUsedAt: string | null;
  mileage: number;
  insuranceExpiry: string | null;
  inspectionExpiry: string | null;
}

export type AssignmentStrategy = (
  candidates: AssignableVehicle[],
  ctx: { pickupLocationId: string },
) => AssignableVehicle[];

/** True if insurance or inspection has expired by `onDate` (a YYYY-MM-DD or ISO string). */
export function hasExpiredPapers(v: AssignableVehicle, onDate: Date): boolean {
  const day = onDate.toISOString().slice(0, 10);
  return (
    (v.insuranceExpiry !== null && v.insuranceExpiry < day) ||
    (v.inspectionExpiry !== null && v.inspectionExpiry < day)
  );
}

/** Preference order: at the pickup location → least recently used → fewest km. */
export const defaultStrategy: AssignmentStrategy = (candidates, ctx) =>
  [...candidates].sort((a, b) => {
    const aHere =
      (a.currentLocationId ?? a.homeLocationId) === ctx.pickupLocationId;
    const bHere =
      (b.currentLocationId ?? b.homeLocationId) === ctx.pickupLocationId;
    if (aHere !== bHere) return aHere ? -1 : 1;
    const aUsed = a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0;
    const bUsed = b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0;
    if (aUsed !== bUsed) return aUsed - bUsed;
    return a.mileage - b.mileage;
  });

/**
 * Picks a specific physical vehicle among `candidates` (already filtered to
 * the requested model and free for the window). Vehicles with expired
 * insurance/inspection are never assignable. The strategy is swappable.
 */
export function pickVehicle(
  candidates: AssignableVehicle[],
  ctx: { pickupLocationId: string; pickupAt: Date },
  strategy: AssignmentStrategy = defaultStrategy,
): AssignableVehicle {
  const eligible = candidates.filter((v) => !hasExpiredPapers(v, ctx.pickupAt));
  if (eligible.length === 0) {
    throw new DomainError(
      "VEHICLE_NOT_ASSIGNABLE",
      "No vehicle with valid insurance and inspection is free for those dates",
    );
  }
  return strategy(eligible, ctx)[0];
}
