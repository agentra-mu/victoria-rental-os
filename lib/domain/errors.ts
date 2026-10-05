/**
 * Machine-readable error codes the AI agent and dashboard branch on — see
 * CLAUDE.md and prompts/02-booking-engine.md. Route handlers under
 * /app/api/engine map these onto the { ok, error: { code, message } } shape.
 */
export const ERROR_CODES = [
  "VEHICLE_UNAVAILABLE",
  "INVALID_DATES",
  "BELOW_MINIMUM_RENTAL",
  "ILLEGAL_TRANSITION",
  "VEHICLE_NOT_FOUND",
  "LOCATION_NOT_FOUND",
  "BOOKING_NOT_FOUND",
  "INCOMPLETE_BOOKING",
  "OUTSIDE_OPENING_HOURS",
  "VEHICLE_NOT_ASSIGNABLE",
  "REQUEST_NOT_PENDING",
] as const;

export type DomainErrorCode = (typeof ERROR_CODES)[number];

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
