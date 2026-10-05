import sharp from "sharp";
import heicConvert from "heic-convert";
import type { DetectedFile } from "./fileValidation";

export interface ProcessedFile {
  buffer: Buffer;
  mimeType: string;
  ext: string;
}

/**
 * Re-encodes every image through sharp with `.rotate()` (bakes in the EXIF
 * orientation, if any) and no `.withMetadata()` call — sharp drops EXIF/GPS
 * metadata by default on a plain re-encode, so this is the "strip EXIF"
 * step from prompts/07-secure-document-upload-page.md. HEIC/HEIF first goes
 * through heic-convert (no native HEIC encoder in sharp's default build) to
 * get real pixels, then through the same sharp re-encode. PDFs have no EXIF
 * concept and pass through untouched.
 */
export async function processUploadedFile(
  buffer: Buffer,
  detected: DetectedFile,
): Promise<ProcessedFile> {
  switch (detected.mime) {
    case "image/heic":
    case "image/heif": {
      const jpeg = await heicConvert({
        buffer,
        format: "JPEG",
        quality: 0.9,
      });
      const stripped = await sharp(jpeg).rotate().jpeg().toBuffer();
      return { buffer: stripped, mimeType: "image/jpeg", ext: "jpg" };
    }
    case "image/jpeg": {
      const stripped = await sharp(buffer).rotate().jpeg().toBuffer();
      return { buffer: stripped, mimeType: "image/jpeg", ext: "jpg" };
    }
    case "image/png": {
      const stripped = await sharp(buffer).rotate().png().toBuffer();
      return { buffer: stripped, mimeType: "image/png", ext: "png" };
    }
    case "application/pdf":
      return { buffer, mimeType: "application/pdf", ext: "pdf" };
  }
}
