import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { handleDocumentUpload } from "./handleUpload";
import { createFakeDocumentStorage } from "./testing/fakeStorage";
import { createFakeDb } from "@/lib/domain/testing/fakeDb";
import { booking } from "@/lib/domain/testing/fixtures";
import { createFakeMessagingDb } from "@/lib/whatsapp/testing/fakeMessagingDb";

const NOW = new Date("2026-11-01T08:00:00Z");

async function jpegBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 10, height: 10, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
}

function makeDeps(
  bookingOverrides: Partial<Parameters<typeof booking>[0]> = {},
) {
  const { db } = createFakeDb({
    bookings: [
      booking({
        id: "b1",
        bookingNumber: 1024,
        status: "PENDING_DOCUMENTS",
        documentStatus: "NOT_SUBMITTED",
        uploadToken: "tok-1",
        uploadTokenExpiresAt: "2026-11-05T00:00:00Z",
        ...bookingOverrides,
      }),
    ],
  });
  const messaging = createFakeMessagingDb();
  const { storage, files } = createFakeDocumentStorage();
  return { db, messaging, storage, files };
}

describe("handleDocumentUpload", () => {
  it("rejects an invalid/expired token without touching storage", async () => {
    const { db, messaging, storage, files } = makeDeps({
      uploadToken: "tok-1",
      uploadTokenExpiresAt: "2026-10-01T00:00:00Z", // already expired
    });
    const result = await handleDocumentUpload(
      { domainDb: db, messaging: messaging.db, storage, now: NOW },
      { token: "tok-1", docType: "PASSPORT", fileBuffer: await jpegBuffer() },
    );
    expect(result).toEqual({
      ok: false,
      code: "INVALID_TOKEN",
      message: expect.stringMatching(/no longer valid/i),
    });
    expect(files.size).toBe(0);
  });

  it("rejects an invalid docType", async () => {
    const { db, messaging, storage } = makeDeps();
    const result = await handleDocumentUpload(
      { domainDb: db, messaging: messaging.db, storage, now: NOW },
      { token: "tok-1", docType: "VISA", fileBuffer: await jpegBuffer() },
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID_DOC_TYPE" });
  });

  it("rejects a file over the size limit", async () => {
    const { db, messaging, storage } = makeDeps();
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);
    const result = await handleDocumentUpload(
      { domainDb: db, messaging: messaging.db, storage, now: NOW },
      { token: "tok-1", docType: "PASSPORT", fileBuffer: big },
    );
    expect(result).toMatchObject({ ok: false, code: "FILE_TOO_LARGE" });
  });

  it("rejects a file whose real bytes don't match an allowed type", async () => {
    const { db, messaging, storage } = makeDeps();
    const result = await handleDocumentUpload(
      { domainDb: db, messaging: messaging.db, storage, now: NOW },
      {
        token: "tok-1",
        docType: "PASSPORT",
        fileBuffer: Buffer.from("not a real image"),
      },
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID_FILE_TYPE" });
  });

  it("stores a valid JPEG, records the document, and moves document_status to PENDING on first upload", async () => {
    const { db, messaging, storage, files } = makeDeps();
    const result = await handleDocumentUpload(
      { domainDb: db, messaging: messaging.db, storage, now: NOW },
      { token: "tok-1", docType: "PASSPORT", fileBuffer: await jpegBuffer() },
    );
    expect(result).toEqual({ ok: true, bothDocumentsReceived: false });

    const updated = await db.getBookingById("b1");
    expect(updated?.documentStatus).toBe("PENDING");

    expect(files.size).toBe(1);
    const [path] = files.keys();
    expect(path).toMatch(/^documents\/b1\/PASSPORT-/);

    const docs = await db.listDocumentsForBooking("b1");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      docType: "PASSPORT",
      mimeType: "image/jpeg",
      storagePath: path,
    });
  });

  it("triggers verification only once both documents are on file", async () => {
    const { db, messaging, storage } = makeDeps();
    const deps = { domainDb: db, messaging: messaging.db, storage, now: NOW };

    const first = await handleDocumentUpload(deps, {
      token: "tok-1",
      docType: "PASSPORT",
      fileBuffer: await jpegBuffer(),
    });
    expect(first).toEqual({ ok: true, bothDocumentsReceived: false });
    expect((await db.getBookingById("b1"))?.documentStatus).toBe("PENDING");
    expect(messaging.notifications).toHaveLength(0);

    const second = await handleDocumentUpload(deps, {
      token: "tok-1",
      docType: "DRIVING_PERMIT",
      fileBuffer: await jpegBuffer(),
    });
    expect(second).toEqual({ ok: true, bothDocumentsReceived: true });
    expect((await db.getBookingById("b1"))?.documentStatus).toBe(
      "NEEDS_REVIEW",
    );
    expect(messaging.notifications).toContainEqual(
      expect.objectContaining({ type: "DOC_REVIEW", bookingId: "b1" }),
    );
  });

  it("allows a re-upload once the booking is flagged NEEDS_REVIEW, even past PENDING_DOCUMENTS", async () => {
    const { db, messaging, storage } = makeDeps({
      status: "CONFIRMED",
      documentStatus: "NEEDS_REVIEW",
    });
    const result = await handleDocumentUpload(
      { domainDb: db, messaging: messaging.db, storage, now: NOW },
      { token: "tok-1", docType: "PASSPORT", fileBuffer: await jpegBuffer() },
    );
    expect(result.ok).toBe(true);
  });
});
