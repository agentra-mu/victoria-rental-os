import { DomainError } from "./errors";
import { MINIMUM_RENTAL_DAYS } from "./config";

/** `now` is injectable so tests don't depend on wall-clock time. */
export function assertDatesAreValid(
  pickupAt: Date,
  returnAt: Date,
  now: Date = new Date(),
): void {
  if (pickupAt.getTime() <= now.getTime()) {
    throw new DomainError("INVALID_DATES", "Pickup date must be in the future");
  }
  if (returnAt.getTime() <= pickupAt.getTime()) {
    throw new DomainError(
      "INVALID_DATES",
      "Return date must be after pickup date",
    );
  }
}

export function assertMinimumRentalDays(
  rentalDays: number,
  minimumDays: number = MINIMUM_RENTAL_DAYS,
): void {
  if (rentalDays < minimumDays) {
    throw new DomainError(
      "BELOW_MINIMUM_RENTAL",
      `Minimum rental is ${minimumDays} day${minimumDays === 1 ? "" : "s"}, got ${rentalDays}`,
    );
  }
}
