import { DEFAULT_RENTAL_DAY_RULE } from "./config";

export type ChangeRequestType =
  | "RETURN_DELAY"
  | "PICKUP_TIME_CHANGE"
  | "RETURN_TIME_CHANGE"
  | "EXTENSION"
  | "LOCATION_CHANGE"
  | "CANCELLATION";

/** Late-return rule — TBD with the owner (see CLAUDE.md open questions). */
export const LATE_RETURN_RULE = {
  graceMinutes: 60,
  /** Charged per started hour after the grace period, up to one full day's rate. */
  hourlyFeeFraction: 0.1,
};

/**
 * Late fee for returning `lateMinutes` after the agreed time: nothing within
 * grace, then 10% of the daily rate per started hour, capped at one day.
 */
export function lateFeeRs(dailyPriceRs: number, lateMinutes: number): number {
  if (lateMinutes <= LATE_RETURN_RULE.graceMinutes) return 0;
  const hours = Math.ceil((lateMinutes - LATE_RETURN_RULE.graceMinutes) / 60);
  return Math.min(
    dailyPriceRs,
    Math.round(hours * dailyPriceRs * LATE_RETURN_RULE.hourlyFeeFraction),
  );
}

/** Whole extra rental days needed to cover a new return time, using the standard day rule. */
export function additionalDays(
  oldReturn: Date,
  newReturn: Date,
  rule = DEFAULT_RENTAL_DAY_RULE,
): number {
  const extraMs = newReturn.getTime() - oldReturn.getTime();
  if (extraMs <= 0) return 0;
  const block = rule.blockHours * 3600_000;
  const grace = rule.graceMinutes * 60_000;
  return Math.ceil(Math.max(0, extraMs - grace) / block);
}

export interface QuoteInput {
  type: ChangeRequestType;
  dailyPriceRs: number;
  currentReturnAt: Date;
  newReturnAt?: Date;
}

/** Additional amount (Rs) the customer would owe if the change were approved. */
export function quoteAdditionalRs(q: QuoteInput): number {
  if (!q.newReturnAt) return 0;
  if (q.type === "RETURN_DELAY") {
    const late =
      (q.newReturnAt.getTime() - q.currentReturnAt.getTime()) / 60000;
    return lateFeeRs(q.dailyPriceRs, late);
  }
  if (q.type === "EXTENSION" || q.type === "RETURN_TIME_CHANGE") {
    return additionalDays(q.currentReturnAt, q.newReturnAt) * q.dailyPriceRs;
  }
  return 0;
}

/** Requests whose requested time has passed without a decision should expire. */
export function isExpired(
  req: { status: string; requestedAt?: string | null },
  now: Date,
): boolean {
  return (
    req.status === "PENDING" &&
    !!req.requestedAt &&
    Date.parse(req.requestedAt) < now.getTime()
  );
}
