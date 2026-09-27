/**
 * Business rules the rental company hasn't confirmed yet (see the "Open
 * questions" list in CLAUDE.md). Centralized here so answering one is a
 * one-line change instead of a hunt through the domain functions.
 */

export const TIMEZONE = "Indian/Mauritius";

export interface RentalDayRule {
  /** Length of one billable block. */
  blockHours: number;
  /** Minutes past a block boundary that don't trigger an extra day. */
  graceMinutes: number;
}

/** Rule TBD with the owner — default is 24-hour blocks rounded up, 60min grace. */
export const DEFAULT_RENTAL_DAY_RULE: RentalDayRule = {
  blockHours: 24,
  graceMinutes: 60,
};

/** Shortest rental the company will accept, in days. TBD with the owner. */
export const MINIMUM_RENTAL_DAYS = 1;

/** How long a confirmed booking's document upload link stays valid. */
export const UPLOAD_TOKEN_TTL_HOURS = 72;
