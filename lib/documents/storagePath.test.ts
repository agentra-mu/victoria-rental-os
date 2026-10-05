import { describe, expect, it } from "vitest";
import { buildStoragePath } from "./storagePath";

describe("buildStoragePath", () => {
  it("builds documents/{bookingId}/{docType}-{uuid}.{ext}", () => {
    const path = buildStoragePath("booking-123", "PASSPORT", "jpg");
    expect(path).toMatch(
      /^documents\/booking-123\/PASSPORT-[0-9a-f-]{36}\.jpg$/,
    );
  });

  it("produces a different path (different uuid) on every call", () => {
    const a = buildStoragePath("booking-123", "DRIVING_PERMIT", "pdf");
    const b = buildStoragePath("booking-123", "DRIVING_PERMIT", "pdf");
    expect(a).not.toBe(b);
  });
});
