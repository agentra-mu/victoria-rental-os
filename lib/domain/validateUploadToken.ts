import type { BookingRow, DomainDb } from "./ports";

export type UploadTokenInvalidReason =
  "NOT_FOUND" | "EXPIRED" | "NOT_ACCEPTING_UPLOADS";

export type UploadTokenValidation =
  | { ok: true; booking: BookingRow }
  | { ok: false; reason: UploadTokenInvalidReason };

/**
 * Gate shared by the upload page and the upload route handler (CLAUDE.md:
 * re-validate on every access, don't trust a token just because a page
 * already rendered it once). A token is only usable while the booking is
 * actually PENDING_DOCUMENTS, or its document_status is NEEDS_REVIEW (a
 * re-upload request) — see prompts/07-secure-document-upload-page.md.
 * Everything else (unknown token, expired, booking moved past this stage)
 * collapses to one generic reason set so callers show a single friendly
 * "request a new link on WhatsApp" message without leaking which case it was.
 */
export async function validateUploadToken(
  db: DomainDb,
  token: string,
  now: Date,
): Promise<UploadTokenValidation> {
  const booking = await db.getBookingByUploadToken(token);
  if (!booking) return { ok: false, reason: "NOT_FOUND" };

  if (
    !booking.uploadTokenExpiresAt ||
    new Date(booking.uploadTokenExpiresAt).getTime() <= now.getTime()
  ) {
    return { ok: false, reason: "EXPIRED" };
  }

  const acceptingUploads =
    booking.status === "PENDING_DOCUMENTS" ||
    booking.documentStatus === "NEEDS_REVIEW";
  if (!acceptingUploads) {
    return { ok: false, reason: "NOT_ACCEPTING_UPLOADS" };
  }

  return { ok: true, booking };
}
