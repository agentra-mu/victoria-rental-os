import { describe, expect, it } from "vitest";
import { validateUploadToken } from "./validateUploadToken";
import { createFakeDb } from "./testing/fakeDb";
import { booking } from "./testing/fixtures";

const NOW = new Date("2026-11-01T08:00:00Z");

describe("validateUploadToken", () => {
  it("rejects an unknown token", async () => {
    const { db } = createFakeDb();
    const result = await validateUploadToken(db, "nope", NOW);
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("rejects an expired token", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "b1",
          status: "PENDING_DOCUMENTS",
          uploadToken: "tok-1",
          uploadTokenExpiresAt: "2026-10-31T00:00:00Z",
        }),
      ],
    });
    const result = await validateUploadToken(db, "tok-1", NOW);
    expect(result).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("rejects a token with no expiry set", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "b1",
          status: "PENDING_DOCUMENTS",
          uploadToken: "tok-1",
          uploadTokenExpiresAt: null,
        }),
      ],
    });
    const result = await validateUploadToken(db, "tok-1", NOW);
    expect(result).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("accepts a valid, unexpired token on a PENDING_DOCUMENTS booking", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "b1",
          status: "PENDING_DOCUMENTS",
          uploadToken: "tok-1",
          uploadTokenExpiresAt: "2026-11-05T00:00:00Z",
        }),
      ],
    });
    const result = await validateUploadToken(db, "tok-1", NOW);
    expect(result.ok).toBe(true);
    expect(result.ok && result.booking.id).toBe("b1");
  });

  it("accepts a re-upload request (NEEDS_REVIEW document status) even past PENDING_DOCUMENTS", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "b1",
          status: "CONFIRMED",
          documentStatus: "NEEDS_REVIEW",
          uploadToken: "tok-1",
          uploadTokenExpiresAt: "2026-11-05T00:00:00Z",
        }),
      ],
    });
    const result = await validateUploadToken(db, "tok-1", NOW);
    expect(result.ok).toBe(true);
  });

  it("rejects a booking that's moved on and isn't NEEDS_REVIEW", async () => {
    const { db } = createFakeDb({
      bookings: [
        booking({
          id: "b1",
          status: "CONFIRMED",
          documentStatus: "VERIFIED",
          uploadToken: "tok-1",
          uploadTokenExpiresAt: "2026-11-05T00:00:00Z",
        }),
      ],
    });
    const result = await validateUploadToken(db, "tok-1", NOW);
    expect(result).toEqual({ ok: false, reason: "NOT_ACCEPTING_UPLOADS" });
  });
});
