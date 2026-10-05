import type { DocType } from "@/lib/domain/ports";

/** documents/{booking_id}/{doc_type}-{uuid}.{ext} — see prompts/07-secure-document-upload-page.md and the documents table comment. */
export function buildStoragePath(
  bookingId: string,
  docType: DocType,
  ext: string,
): string {
  return `documents/${bookingId}/${docType}-${crypto.randomUUID()}.${ext}`;
}
