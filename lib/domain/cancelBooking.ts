import { DomainError } from "./errors";
import { assertTransition } from "./bookingStatus";
import type { BookingEventActor, BookingRow, DomainDb } from "./ports";

/** Moves a booking to CANCELLED from any active status (CLAUDE.md) and logs why. */
export async function cancelBooking(
  db: DomainDb,
  bookingId: string,
  actor: BookingEventActor,
  reason: string,
): Promise<BookingRow> {
  const booking = await db.getBookingById(bookingId);
  if (!booking) {
    throw new DomainError(
      "BOOKING_NOT_FOUND",
      `Booking ${bookingId} does not exist`,
    );
  }

  assertTransition(booking.status, "CANCELLED");

  const updated = await db.updateBooking(bookingId, { status: "CANCELLED" });
  await db.recordEvent({
    bookingId,
    eventType: "BOOKING_CANCELLED",
    actor,
    payload: { reason },
  });
  return updated;
}
