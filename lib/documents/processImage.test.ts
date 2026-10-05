import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { processUploadedFile } from "./processImage";
import type { DetectedFile } from "./fileValidation";

// No real .heic sample ships with heic-convert's published package (its test
// fixtures are downloaded separately, not published), so the HEIC branch is
// exercised with heic-convert mocked to hand back a real JPEG buffer — real
// sharp still does the actual re-encode/strip on that output. Real HEIC
// decoding itself is integration-tested manually, not here.
vi.mock("heic-convert", () => ({
  default: vi.fn(async () =>
    sharp({ create: { width: 3, height: 3, channels: 3, background: "green" } })
      .jpeg()
      .toBuffer(),
  ),
}));

async function jpegWithExif(): Promise<Buffer> {
  return sharp({
    create: { width: 6, height: 4, channels: 3, background: "red" },
  })
    .withMetadata({ exif: { IFD0: { Copyright: "Should be stripped" } } })
    .jpeg()
    .toBuffer();
}

describe("processUploadedFile", () => {
  it("strips EXIF from a JPEG and keeps it a JPEG", async () => {
    const input = await jpegWithExif();
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();

    const result = await processUploadedFile(input, {
      mime: "image/jpeg",
      ext: "jpg",
    } satisfies DetectedFile);

    expect(result.mimeType).toBe("image/jpeg");
    expect(result.ext).toBe("jpg");
    const after = await sharp(result.buffer).metadata();
    expect(after.exif).toBeUndefined();
  });

  it("strips metadata from a PNG and keeps it a PNG", async () => {
    const input = await sharp({
      create: { width: 5, height: 5, channels: 3, background: "blue" },
    })
      .withMetadata({ exif: { IFD0: { Copyright: "Should be stripped" } } })
      .png()
      .toBuffer();

    const result = await processUploadedFile(input, {
      mime: "image/png",
      ext: "png",
    } satisfies DetectedFile);

    expect(result.mimeType).toBe("image/png");
    const after = await sharp(result.buffer).metadata();
    expect(after.exif).toBeUndefined();
  });

  it("converts HEIC to a clean JPEG", async () => {
    const result = await processUploadedFile(Buffer.from("fake heic bytes"), {
      mime: "image/heic",
      ext: "heic",
    } satisfies DetectedFile);

    expect(result.mimeType).toBe("image/jpeg");
    expect(result.ext).toBe("jpg");
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("passes a PDF through untouched", async () => {
    const input = Buffer.from("%PDF-1.4\n...fake...\n%%EOF");
    const result = await processUploadedFile(input, {
      mime: "application/pdf",
      ext: "pdf",
    } satisfies DetectedFile);

    expect(result.buffer).toEqual(input);
    expect(result.mimeType).toBe("application/pdf");
  });
});
