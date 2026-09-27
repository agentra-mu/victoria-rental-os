import { DomainError } from "./errors";
import { assertTransition, type BookingStatus } from "./bookingStatus";
import {
  assertDatesAreValid,
  assertMinimumRentalDays,
} from "./bookingValidation";
import { calculateRentalDays } from "./calculateRentalDays";
import { calculatePrice } from "./calculatePrice";
import type { BookingPatch, BookingRow, DomainDb, LocationRow } from "./ports";

export interface UpdateBookingDraftFields {
  vehicleId?: string;
  pickupAt?: Date | string;
  returnAt?: Date | string;
  pickupLocationId?: string;
  dropoffLocationId?: string;
}

const DRAFT_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "ENQUIRY",
  "CAR_SELECTED",
  "DATES_SELECTED",
]);

function deriveDraftStatus(
  hasVehicle: boolean,
  hasDates: boolean,
): BookingStatus {
  if (hasVehicle && hasDates) return "DATES_SELECTED";
  if (hasVehicle) return "CAR_SELECTED";
  return "ENQUIRY";
}

/**
 * Updates the car/dates/locations on a draft booking. Re-validates and
 * re-checks availability against the *effective* field values (existing
 * fields merged with the patch) every time, and advances status along the
 * CLAUDE.md flow as fields fill in — never backwards, since that's not a
 * legal transition in bookingStatus.ts.
 */
export async function updateBookingDraft(
  db: DomainDb,
  bookingId: string,
  fields: UpdateBookingDraftFields,
  now: Date = new Date(),
): Promise<BookingRow> {
  const booking = await db.getBookingById(bookingId);
  if (!booking) {
    throw new DomainError(
      "BOOKING_NOT_FOUND",
      `Booking ${bookingId} does not exist`,
    );
  }
  if (!DRAFT_STATUSES.has(booking.status)) {
    throw new DomainError(
      "ILLEGAL_TRANSITION",
      `Booking ${bookingId} is ${booking.status} and can no longer be edited as a draft`,
    );
  }

  const vehicleId = fields.vehicleId ?? booking.vehicleId ?? undefined;
  const pickupLocationId =
    fields.pickupLocationId ?? booking.pickupLocationId ?? undefined;
  const dropoffLocationId =
    fields.dropoffLocationId ?? booking.dropoffLocationId ?? pickupLocationId;
  const pickupAtRaw = fields.pickupAt ?? booking.pickupAt ?? undefined;
  const returnAtRaw = fields.returnAt ?? booking.returnAt ?? undefined;

  const patch: BookingPatch = {};
  if (fields.vehicleId !== undefined) patch.vehicleId = fields.vehicleId;
  if (fields.pickupLocationId !== undefined)
    patch.pickupLocationId = fields.pickupLocationId;
  if (fields.dropoffLocationId !== undefined)
    patch.dropoffLocationId = fields.dropoffLocationId;
  if (fields.pickupAt !== undefined)
    patch.pickupAt = new Date(fields.pickupAt).toISOString();
  if (fields.returnAt !== undefined)
    patch.returnAt = new Date(fields.returnAt).toISOString();

  if (vehicleId) {
    const vehicle = await db.getVehicleById(vehicleId);
    if (!vehicle || vehicle.status !== "ACTIVE") {
      throw new DomainError(
        "VEHICLE_UNAVAILABLE",
        `Vehicle ${vehicleId} is not available`,
      );
    }
  }

  let pickupLocation: LocationRow | null = null;
  let dropoffLocation: LocationRow | null = null;
  if (pickupLocationId) {
    pickupLocation = await db.getLocationById(pickupLocationId);
    if (!pickupLocation || !pickupLocation.active || !pickupLocation.isPickup) {
      throw new DomainError(
        "LOCATION_NOT_FOUND",
        `Location ${pickupLocationId} is not a valid pickup location`,
      );
    }
  }
  if (dropoffLocationId) {
    dropoffLocation =
      dropoffLocationId === pickupLocationId
        ? pickupLocation
        : await db.getLocationById(dropoffLocationId);
    if (
      !dropoffLocation ||
      !dropoffLocation.active ||
      !dropoffLocation.isDropoff
    ) {
      throw new DomainError(
        "LOCATION_NOT_FOUND",
        `Location ${dropoffLocationId} is not a valid drop-off location`,
      );
    }
  }

  let pickupAt: Date | undefined;
  let returnAt: Date | undefined;
  const hasDates = Boolean(pickupAtRaw && returnAtRaw && pickupLocationId);

  if (pickupAtRaw && returnAtRaw) {
    pickupAt = new Date(pickupAtRaw);
    returnAt = new Date(returnAtRaw);
    assertDatesAreValid(pickupAt, returnAt, now);
    assertMinimumRentalDays(calculateRentalDays(pickupAt, returnAt));
  }

  if (vehicleId && pickupAt && returnAt) {
    const unavailable = await db.findOverlappingVehicleIds({
      vehicleIds: [vehicleId],
      pickupAt,
      returnAt,
      excludeBookingId: bookingId,
    });
    if (unavailable.has(vehicleId)) {
      throw new DomainError(
        "VEHICLE_UNAVAILABLE",
        `Vehicle ${vehicleId} is not available for those dates`,
      );
    }
  }

  const nextStatus = deriveDraftStatus(Boolean(vehicleId), hasDates);
  if (nextStatus !== booking.status) {
    assertTransition(booking.status, nextStatus);
    patch.status = nextStatus;
  }

  if (vehicleId && pickupAt && returnAt && pickupLocationId) {
    const price = await calculatePrice(db, {
      vehicleId,
      pickupAt,
      returnAt,
      pickupLocationId,
      dropoffLocationId,
    });
    patch.rentalDays = price.rentalDays;
    patch.dailyPriceRs = price.dailyPriceRs;
    patch.totalRs = price.totalRs;
  }

  return db.updateBooking(bookingId, patch);
}
