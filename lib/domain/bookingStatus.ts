import { DomainError } from "./errors";

export const BOOKING_STATUSES = [
  "ENQUIRY",
  "CAR_SELECTED",
  "DATES_SELECTED",
  "PENDING_DOCUMENTS",
  "DOCUMENTS_VERIFIED",
  "CONFIRMED",
  "PICKED_UP",
  "RETURNED",
  "COMPLETED",
  "CANCELLED",
  "NEEDS_HUMAN",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** No transition leaves these — the booking's story is over. */
const TERMINAL_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "CANCELLED",
  "COMPLETED",
]);

/**
 * ENQUIRY, CAR_SELECTED and DATES_SELECTED are all "the draft is still being
 * filled in" — updateBookingDraft can set vehicle and dates in the same
 * call, so a draft can move freely between these three (in either
 * direction, as fields are added or cleared) rather than one step at a time.
 */
const DRAFT_STATUSES: readonly BookingStatus[] = [
  "ENQUIRY",
  "CAR_SELECTED",
  "DATES_SELECTED",
];

/** From DATES_SELECTED onward, each step is a real, one-way business event. */
const HAPPY_PATH: ReadonlyArray<readonly [BookingStatus, BookingStatus]> = [
  ["DATES_SELECTED", "PENDING_DOCUMENTS"],
  ["PENDING_DOCUMENTS", "DOCUMENTS_VERIFIED"],
  ["DOCUMENTS_VERIFIED", "CONFIRMED"],
  ["CONFIRMED", "PICKED_UP"],
  ["PICKED_UP", "RETURNED"],
  ["RETURNED", "COMPLETED"],
];

function buildTransitions(): ReadonlyMap<
  BookingStatus,
  ReadonlySet<BookingStatus>
> {
  const map = new Map<BookingStatus, Set<BookingStatus>>();
  for (const status of BOOKING_STATUSES) map.set(status, new Set());

  for (const from of DRAFT_STATUSES) {
    for (const to of DRAFT_STATUSES) {
      if (from !== to) map.get(from)!.add(to);
    }
  }

  for (const [from, to] of HAPPY_PATH) map.get(from)!.add(to);

  // A human resolves NEEDS_HUMAN by moving the booking to wherever it should
  // resume — there's no single fixed "next" status coming out of it.
  for (const status of BOOKING_STATUSES) {
    if (status !== "NEEDS_HUMAN" && !TERMINAL_STATUSES.has(status)) {
      map.get("NEEDS_HUMAN")!.add(status);
    }
  }

  // CANCELLED and NEEDS_HUMAN are reachable from any active status (CLAUDE.md).
  for (const status of BOOKING_STATUSES) {
    if (TERMINAL_STATUSES.has(status)) continue;
    map.get(status)!.add("CANCELLED");
    if (status !== "NEEDS_HUMAN") map.get(status)!.add("NEEDS_HUMAN");
  }

  return map;
}

export const ALLOWED_TRANSITIONS = buildTransitions();

export function isActiveStatus(status: BookingStatus): boolean {
  return !TERMINAL_STATUSES.has(status);
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS.get(from)?.has(to) ?? false;
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError(
      "ILLEGAL_TRANSITION",
      `Cannot transition booking from ${from} to ${to}`,
    );
  }
}
