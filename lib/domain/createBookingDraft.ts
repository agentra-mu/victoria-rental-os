import type { BookingRow, DomainDb } from "./ports";

/** Starts a new ENQUIRY booking — no car, dates or price yet. */
export async function createBookingDraft(
  db: DomainDb,
  customerId: string,
): Promise<BookingRow> {
  return db.createBooking(customerId);
}
