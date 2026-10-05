import { fileTypeFromBuffer } from "file-type";
import type { DocType } from "@/lib/domain/ports";

export const DOC_TYPES: readonly DocType[] = ["PASSPORT", "DRIVING_PERMIT"];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function isValidDocType(value: unknown): value is DocType {
  return typeof value === "string" && DOC_TYPES.includes(value as DocType);
}

export interface DetectedFile {
  mime:
    | "image/jpeg"
    | "image/png"
    | "image/heic"
    | "image/heif"
    | "application/pdf";
  ext: string;
}

const ALLOWED_MIME_EXT: Record<DetectedFile["mime"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heic",
  "application/pdf": "pdf",
};

function isAllowedMime(mime: string): mime is DetectedFile["mime"] {
  return mime in ALLOWED_MIME_EXT;
}

/**
 * Identifies a file by its actual bytes (magic numbers), never trusting the
 * browser-supplied Content-Type or filename extension — CLAUDE.md-adjacent
 * rule from prompts/07-secure-document-upload-page.md: "checks real file
 * type via magic bytes". Returns null for anything unrecognised or outside
 * the allowed JPEG/PNG/HEIC/PDF set.
 */
export async function detectRealFileType(
  buffer: Buffer,
): Promise<DetectedFile | null> {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !isAllowedMime(detected.mime)) return null;
  return { mime: detected.mime, ext: ALLOWED_MIME_EXT[detected.mime] };
}
