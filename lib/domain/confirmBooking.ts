import { randomBytes } from "node:crypto";
import { DomainError } from "./errors";
import { assertTransition } from "./bookingStatus";
import { isExclusionViolation } from "./pgErrors";
import { UPLOAD_TOKEN_TTL_HOURS } from "./config";
import type { BookingRow, DomainDb } from "./ports";

function generateUploadToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * DATES_SELECTED → PENDING_DOCUMENTS. Re-checks availability at the
 * application level, then relies on the DB's exclusion constraint as the
 * final word — if two confirmations for the same vehicle/time race past the
 * pre-check, the second one's write fails there and is turned into a clean
 * VEHICLE_UNAVAILABLE instead of a raw Postgres error.
 */
export async function confirmBooking(
  db: DomainDb,
  bookingId: string,
  now: Date = new Date(),
): Promise<BookingRow> {
  const booking = await db.getBookingById(bookingId);
  if (!booking) {
    throw new DomainError(
      "BOOKING_NOT_FOUND",
      `Booking ${bookingId} does not exist`,
    );
  }

  assertTransition(booking.status, "PENDING_DOCUMENTS");

  if (
    !booking.vehicleId ||
    !booking.pickupAt ||
    !booking.returnAt ||
    !booking.pickupLocationId
  ) {
    throw new DomainError(
      "INCOMPLETE_BOOKING",
      `Booking ${bookingId} is missing a vehicle, dates, or a pickup location`,
    );
  }

  const pickupAt = new Date(booking.pickupAt);
  const returnAt = new Date(booking.returnAt);

  const unavailable = await db.findOverlappingVehicleIds({
    vehicleIds: [booking.vehicleId],
    pickupAt,
    returnAt,
    excludeBookingId: bookingId,
  });
  if (unavailable.has(booking.vehicleId)) {
    throw new DomainError(
      "VEHICLE_UNAVAILABLE",
      `Vehicle ${booking.vehicleId} was booked by someone else`,
    );
  }

  const uploadTokenExpiresAt = new Date(
    now.getTime() + UPLOAD_TOKEN_TTL_HOURS * 60 * 60 * 1000,
  );

  try {
    return await db.updateBooking(bookingId, {
      status: "PENDING_DOCUMENTS",
      uploadToken: generateUploadToken(),
      uploadTokenExpiresAt: uploadTokenExpiresAt.toISOString(),
    });
  } catch (error) {
    if (isExclusionViolation(error)) {
      throw new DomainError(
        "VEHICLE_UNAVAILABLE",
        `Vehicle ${booking.vehicleId} was booked by someone else while confirming`,
      );
    }
    throw error;
  }
}
