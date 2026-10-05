import "server-only";
import { NextResponse } from "next/server";
import { getDocumentsDeps } from "@/lib/documents/db";
import { createSupabaseDocumentStorage } from "@/lib/documents/storage";
import { createInMemoryRateLimiter } from "@/lib/documents/rateLimit";
import {
  handleDocumentUpload,
  type HandleUploadFailureCode,
} from "@/lib/documents/handleUpload";

// Per-process best-effort limiters — see lib/documents/rateLimit.ts for the
// "per warm instance, not global" caveat. Generous enough for a customer
// genuinely retrying a bad photo, tight enough to blunt a scripted abuser.
const tokenLimiter = createInMemoryRateLimiter({
  maxAttempts: 20,
  windowMs: 10 * 60_000,
});
const ipLimiter = createInMemoryRateLimiter({
  maxAttempts: 40,
  windowMs: 10 * 60_000,
});

const FAILURE_STATUS: Record<HandleUploadFailureCode, number> = {
  INVALID_TOKEN: 404,
  INVALID_DOC_TYPE: 400,
  FILE_TOO_LARGE: 413,
  INVALID_FILE_TYPE: 415,
  STORAGE_ERROR: 500,
};

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

/**
 * Receives one document (passport or driving permit) for a booking,
 * identified by its upload_token — see /app/documents/[token]/page.tsx for
 * the form that posts here, and prompts/07-secure-document-upload-page.md
 * for the full contract. All real validation happens in
 * lib/documents/handleUpload.ts; this file is just the Next.js/FormData
 * plumbing around it.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/documents/[token]">,
) {
  const { token } = await ctx.params;
  const now = new Date();

  if (
    !tokenLimiter.check(token, now) ||
    !ipLimiter.check(clientIp(request), now)
  ) {
    return errorResponse(
      "RATE_LIMITED",
      "Too many attempts — please wait a few minutes and try again.",
      429,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(
      "INVALID_REQUEST",
      "Expected multipart form data.",
      400,
    );
  }

  const docType = formData.get("docType");
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorResponse("INVALID_REQUEST", "Missing file.", 400);
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const { domainDb, messaging, storage: bucket } = getDocumentsDeps();

  try {
    const result = await handleDocumentUpload(
      {
        domainDb,
        messaging,
        storage: createSupabaseDocumentStorage(bucket),
        now,
      },
      { token, docType, fileBuffer },
    );

    if (!result.ok) {
      return errorResponse(
        result.code,
        result.message,
        FAILURE_STATUS[result.code],
      );
    }
    return NextResponse.json({
      ok: true,
      data: { bothDocumentsReceived: result.bothDocumentsReceived },
    });
  } catch (error) {
    console.error("[documents] upload route failed", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "Something went wrong — please try again.",
      500,
    );
  }
}
