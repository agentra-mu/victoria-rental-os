import "server-only";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireEnv } from "@/lib/env";
import { DomainError, type DomainErrorCode } from "@/lib/domain/errors";

/**
 * Shared response shaping and auth for every internal API route — the ones
 * n8n and the backend call directly, under /app/api/engine and
 * /app/api/whatsapp. Not used by anything customer- or browser-facing.
 */

/** Validated as a real instant rather than a specific string format, so any valid ISO offset works. */
export const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "must be a valid ISO date-time",
  });

/** Only n8n and the backend may call these routes. Returns a 401 response, or null if authorized. */
export function checkInternalSecret(request: Request): NextResponse | null {
  const { INTERNAL_API_SECRET } = requireEnv(process.env, [
    "INTERNAL_API_SECRET",
  ]);
  const provided = request.headers.get("x-internal-secret");
  if (provided !== INTERNAL_API_SECRET) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid x-internal-secret header",
        },
      },
      { status: 401 },
    );
  }
  return null;
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

const ERROR_STATUS: Record<
  DomainErrorCode | "VALIDATION_ERROR" | "UNAUTHORIZED" | "INTERNAL_ERROR",
  number
> = {
  VEHICLE_UNAVAILABLE: 409,
  INVALID_DATES: 422,
  BELOW_MINIMUM_RENTAL: 422,
  ILLEGAL_TRANSITION: 409,
  VEHICLE_NOT_FOUND: 404,
  LOCATION_NOT_FOUND: 404,
  BOOKING_NOT_FOUND: 404,
  INCOMPLETE_BOOKING: 422,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  INTERNAL_ERROR: 500,
};

/** Converts a thrown error into the { ok: false, error: { code, message } } shape the AI/n8n can branch on. */
export function jsonError(error: unknown) {
  if (error instanceof DomainError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: ERROR_STATUS[error.code] },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues.map((issue) => issue.message).join("; "),
        },
      },
      { status: ERROR_STATUS.VALIDATION_ERROR },
    );
  }
  console.error(error);
  return NextResponse.json(
    {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Unexpected error" },
    },
    { status: ERROR_STATUS.INTERNAL_ERROR },
  );
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
