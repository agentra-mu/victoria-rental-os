import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { detectRealFileType, isValidDocType } from "./fileValidation";

describe("isValidDocType", () => {
  it("accepts PASSPORT and DRIVING_PERMIT", () => {
    expect(isValidDocType("PASSPORT")).toBe(true);
    expect(isValidDocType("DRIVING_PERMIT")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidDocType("passport")).toBe(false);
    expect(isValidDocType("ID_CARD")).toBe(false);
    expect(isValidDocType(undefined)).toBe(false);
    expect(isValidDocType(42)).toBe(false);
  });
});

describe("detectRealFileType", () => {
  it("identifies a real JPEG by its bytes", async () => {
    const buffer = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "red" },
    })
      .jpeg()
      .toBuffer();
    const detected = await detectRealFileType(buffer);
    expect(detected).toEqual({ mime: "image/jpeg", ext: "jpg" });
  });

  it("identifies a real PNG by its bytes", async () => {
    const buffer = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const detected = await detectRealFileType(buffer);
    expect(detected).toEqual({ mime: "image/png", ext: "png" });
  });

  it("identifies a PDF by its bytes", async () => {
    const buffer = Buffer.from(
      "%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
    );
    const detected = await detectRealFileType(buffer);
    expect(detected).toEqual({ mime: "application/pdf", ext: "pdf" });
  });

  it("rejects a file type outside the allow-list even though it's recognised (e.g. GIF)", async () => {
    const gifHeader = Buffer.from("GIF89a", "ascii");
    const detected = await detectRealFileType(gifHeader);
    expect(detected).toBeNull();
  });

  it("rejects a JPEG file renamed from garbage bytes (no real signature)", async () => {
    const detected = await detectRealFileType(Buffer.from("not a real file"));
    expect(detected).toBeNull();
  });

  it("rejects a text file pretending to be a PDF by filename alone", async () => {
    // No magic bytes at all — exactly what a spoofed Content-Type/extension would produce.
    const detected = await detectRealFileType(Buffer.from("just some text"));
    expect(detected).toBeNull();
  });
});
