import { DomainError } from "./errors";
import { calculateRentalDays } from "./calculateRentalDays";
import type { RentalDayRule } from "./config";
import { checkAfterHours } from "./openingHours";
import type { DomainDb } from "./ports";

export interface PriceLineItem {
  label: string;
  amountRs: number;
}

export interface PriceBreakdown {
  rentalDays: number;
  dailyPriceRs: number;
  baseRs: number;
  locationFeesRs: number;
  extrasRs: number;
  totalRs: number;
  lineItems: PriceLineItem[];
}

export interface CalculatePriceArgs {
  vehicleId: string;
  pickupAt: Date | string;
  returnAt: Date | string;
  pickupLocationId: string;
  dropoffLocationId?: string;
  extrasRs?: number;
  rentalDayRule?: RentalDayRule;
}

/** Prices come only from vehicles.daily_price_rs and locations.extra_fee_rs — never invented (see CLAUDE.md). */
export async function calculatePrice(
  db: DomainDb,
  args: CalculatePriceArgs,
): Promise<PriceBreakdown> {
  const vehicle = await db.getVehicleById(args.vehicleId);
  if (!vehicle) {
    throw new DomainError(
      "VEHICLE_NOT_FOUND",
      `Vehicle ${args.vehicleId} does not exist`,
    );
  }

  const dropoffLocationId = args.dropoffLocationId ?? args.pickupLocationId;

  const pickupLocation = await db.getLocationById(args.pickupLocationId);
  if (!pickupLocation) {
    throw new DomainError(
      "LOCATION_NOT_FOUND",
      `Location ${args.pickupLocationId} does not exist`,
    );
  }
  const dropoffLocation =
    dropoffLocationId === args.pickupLocationId
      ? pickupLocation
      : await db.getLocationById(dropoffLocationId);
  if (!dropoffLocation) {
    throw new DomainError(
      "LOCATION_NOT_FOUND",
      `Location ${dropoffLocationId} does not exist`,
    );
  }

  const rentalDays = calculateRentalDays(
    args.pickupAt,
    args.returnAt,
    args.rentalDayRule,
  );
  const baseRs = vehicle.dailyPriceRs * rentalDays;
  const extrasRs = args.extrasRs ?? 0;

  const lineItems: PriceLineItem[] = [
    {
      label: `${rentalDays} day${rentalDays === 1 ? "" : "s"} × Rs ${vehicle.dailyPriceRs}`,
      amountRs: baseRs,
    },
  ];

  let locationFeesRs = 0;
  if (pickupLocation.extraFeeRs > 0) {
    locationFeesRs += pickupLocation.extraFeeRs;
    lineItems.push({
      label: `Pickup fee — ${pickupLocation.name}`,
      amountRs: pickupLocation.extraFeeRs,
    });
  }
  if (
    dropoffLocation.id !== pickupLocation.id &&
    dropoffLocation.extraFeeRs > 0
  ) {
    locationFeesRs += dropoffLocation.extraFeeRs;
    lineItems.push({
      label: `Drop-off fee — ${dropoffLocation.name}`,
      amountRs: dropoffLocation.extraFeeRs,
    });
  }

  for (const [loc, when, label] of [
    [pickupLocation, args.pickupAt, "pickup"],
    [dropoffLocation, args.returnAt, "return"],
  ] as const) {
    const check = checkAfterHours(loc, new Date(when));
    if (!check.afterHours) continue;
    if (!check.allowed) {
      throw new DomainError(
        "OUTSIDE_OPENING_HOURS",
        `${loc.name} is closed at the requested ${label} time and does not allow after-hours ${label}`,
      );
    }
    if (check.feeRs > 0) {
      locationFeesRs += check.feeRs;
      lineItems.push({
        label: `After-hours ${label} fee — ${loc.name}`,
        amountRs: check.feeRs,
      });
    }
  }

  if (extrasRs > 0) {
    lineItems.push({ label: "Extras", amountRs: extrasRs });
  }

  const totalRs = baseRs + locationFeesRs + extrasRs;

  return {
    rentalDays,
    dailyPriceRs: vehicle.dailyPriceRs,
    baseRs,
    locationFeesRs,
    extrasRs,
    totalRs,
    lineItems,
  };
}
