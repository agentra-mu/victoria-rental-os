import type { DomainDb } from "@/lib/domain/ports";
import { validateUploadToken } from "@/lib/domain/validateUploadToken";
import type { MessagingDb } from "@/lib/whatsapp/ports";
import { runVerification } from "@/lib/verification/run";
import {
  DOC_TYPES,
  MAX_FILE_SIZE_BYTES,
  detectRealFileType,
  isValidDocType,
} from "./fileValidation";
import { processUploadedFile } from "./processImage";
import { buildStoragePath } from "./storagePath";
import type { DocumentStorage } from "./storage";

export interface HandleUploadDeps {
  domainDb: DomainDb;
  messaging: MessagingDb;
  storage: DocumentStorage;
  now: Date;
}

export interface HandleUploadInput {
  token: string;
  docType: unknown;
  fileBuffer: Buffer;
}

export type HandleUploadFailureCode =
  | "INVALID_TOKEN"
  | "INVALID_DOC_TYPE"
  | "FILE_TOO_LARGE"
  | "INVALID_FILE_TYPE"
  | "STORAGE_ERROR";

export type HandleUploadResult =
  | { ok: true; bothDocumentsReceived: boolean }
  | { ok: false; code: HandleUploadFailureCode; message: string };

/**
 * The actual upload flow behind /app/api/documents/[token]/route.ts, kept
 * separate from Next.js's Request/FormData plumbing so it's unit-testable
 * with fakes (see prompts/07-secure-document-upload-page.md, step 3): never
 * trusts the token or browser-supplied type, strips EXIF/converts HEIC,
 * stores to the private bucket, records the documents row, and once both
 * PASSPORT and DRIVING_PERMIT are on file, kicks off verification.
 */
export async function handleDocumentUpload(
  deps: HandleUploadDeps,
  input: HandleUploadInput,
): Promise<HandleUploadResult> {
  const tokenResult = await validateUploadToken(
    deps.domainDb,
    input.token,
    deps.now,
  );
  if (!tokenResult.ok) {
    return {
      ok: false,
      code: "INVALID_TOKEN",
      message:
        "This upload link is no longer valid. Please request a new one on WhatsApp.",
    };
  }
  const booking = tokenResult.booking;

  if (!isValidDocType(input.docType)) {
    return {
      ok: false,
      code: "INVALID_DOC_TYPE",
      message: `docType must be one of: ${DOC_TYPES.join(", ")}.`,
    };
  }

  if (input.fileBuffer.byteLength === 0) {
    return {
      ok: false,
      code: "INVALID_FILE_TYPE",
      message: "That file is empty.",
    };
  }
  if (input.fileBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: "That file is larger than 10MB — please use a smaller one.",
    };
  }

  const detected = await detectRealFileType(input.fileBuffer);
  if (!detected) {
    return {
      ok: false,
      code: "INVALID_FILE_TYPE",
      message: "Please upload a JPEG, PNG, HEIC or PDF file.",
    };
  }

  const processed = await processUploadedFile(input.fileBuffer, detected);
  const storagePath = buildStoragePath(
    booking.id,
    input.docType,
    processed.ext,
  );

  try {
    await deps.storage.upload(
      storagePath,
      processed.buffer,
      processed.mimeType,
    );
  } catch (error) {
    console.error("[documents] storage upload failed", error);
    return {
      ok: false,
      code: "STORAGE_ERROR",
      message: "Something went wrong saving your file — please try again.",
    };
  }

  await deps.domainDb.createDocument({
    bookingId: booking.id,
    customerId: booking.customerId,
    docType: input.docType,
    storagePath,
    mimeType: processed.mimeType,
  });

  if (booking.documentStatus === "NOT_SUBMITTED") {
    await deps.domainDb.updateBooking(booking.id, {
      documentStatus: "PENDING",
    });
  }

  const documents = await deps.domainDb.listDocumentsForBooking(booking.id);
  const docTypesOnFile = new Set(documents.map((d) => d.docType));
  const bothDocumentsReceived = DOC_TYPES.every((t) => docTypesOnFile.has(t));

  if (bothDocumentsReceived) {
    await runVerification(
      { domainDb: deps.domainDb, messaging: deps.messaging },
      booking.id,
    );
  }

  return { ok: true, bothDocumentsReceived };
}
