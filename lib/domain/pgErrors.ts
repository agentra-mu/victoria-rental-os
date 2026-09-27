/**
 * bookings_no_overlapping_vehicle_time (see the bookings migration) is the
 * safety net against double-booking: even if application code re-checks
 * availability and still races, Postgres refuses the write. This lets
 * confirmBooking / updateBookingDraft catch that specific failure and turn
 * it into a clean VEHICLE_UNAVAILABLE instead of a raw SQL error.
 */
const EXCLUSION_VIOLATION = "23P01";

export interface PgLikeError {
  code?: string | null;
  message?: string;
}

export function isExclusionViolation(error: unknown): error is PgLikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as PgLikeError).code === EXCLUSION_VIOLATION
  );
}
