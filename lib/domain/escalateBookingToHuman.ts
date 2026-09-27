import { canTransition } from "./bookingStatus";
import type { BookingRow, DomainDb } from "./ports";

/**
 * Moves a booking to NEEDS_HUMAN when a customer asks for a person (Component
 * 4/11 takeover flow). A no-op — not an error — if the booking is already
 * terminal (CANCELLED/COMPLETED) or already NEEDS_HUMAN, since "the customer
 * wants a human" doesn't always mean there's an in-flight booking to escalate.
 */
export async function escalateBookingToHuman(
  db: DomainDb,
  bookingId: string,
): Promise<BookingRow | null> {
  const booking = await db.getBookingById(bookingId);
  if (!booking) return null;
  if (!canTransition(booking.status, "NEEDS_HUMAN")) return booking;
  return db.updateBooking(bookingId, { status: "NEEDS_HUMAN" });
}
