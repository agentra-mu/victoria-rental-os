import type { DomainDb } from "@/lib/domain/ports";
import type { MessagingDb } from "@/lib/whatsapp/ports";

export interface VerificationDeps {
  domainDb: DomainDb;
  messaging: MessagingDb;
}

/**
 * Runs once both documents (passport + driving permit) are on file for a
 * booking. This is a stub — Component 8 replaces it with real extraction
 * (OCR, name match against the booking, expiry check). Until then it has no
 * basis to ever claim VERIFIED (CLAUDE.md: the system only ever produces
 * VERIFIED or NEEDS_REVIEW, never auto-rejects), so it always flags the
 * booking for manual review instead of guessing.
 */
export async function runVerification(
  deps: VerificationDeps,
  bookingId: string,
): Promise<void> {
  const booking = await deps.domainDb.getBookingById(bookingId);
  if (!booking) return;

  await deps.domainDb.updateBooking(bookingId, {
    documentStatus: "NEEDS_REVIEW",
  });

  const alreadyOpen = await deps.messaging.hasOpenNotificationForBooking(
    bookingId,
    "DOC_REVIEW",
  );
  if (alreadyOpen) return;

  await deps.messaging.createOwnerNotification({
    type: "DOC_REVIEW",
    title: `Documents ready for review — booking #${booking.bookingNumber}`,
    body: "Automatic verification isn't implemented yet — please check the uploaded passport and driving permit manually.",
    bookingId,
  });
}
