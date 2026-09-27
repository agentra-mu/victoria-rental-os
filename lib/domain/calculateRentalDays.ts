import { DomainError } from "./errors";
import { DEFAULT_RENTAL_DAY_RULE, type RentalDayRule } from "./config";

/**
 * Counts billable rental days as whole blocks (default 24h) with a grace
 * period past each boundary. Operates on absolute instants — pickupAt/
 * returnAt carry their own UTC offset, so a rental crossing midnight
 * Indian/Mauritius is handled correctly without any timezone-aware
 * calendar-day logic here.
 */
export function calculateRentalDays(
  pickupAt: Date | string,
  returnAt: Date | string,
  rule: RentalDayRule = DEFAULT_RENTAL_DAY_RULE,
): number {
  const pickup = new Date(pickupAt);
  const returnDate = new Date(returnAt);
  const durationMs = returnDate.getTime() - pickup.getTime();

  if (durationMs <= 0) {
    throw new DomainError(
      "INVALID_DATES",
      "Return date must be after pickup date",
    );
  }

  const blockMs = rule.blockHours * 60 * 60 * 1000;
  const graceMs = rule.graceMinutes * 60 * 1000;
  const billableMs = Math.max(durationMs - graceMs, 0);

  return Math.max(1, Math.ceil(billableMs / blockMs));
}
