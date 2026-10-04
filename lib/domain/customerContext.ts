import type { BookingStatus } from "./bookingStatus";
import type { BookingRow, DomainDb } from "./ports";
import type { CustomerRow, MessagingDb } from "@/lib/whatsapp/ports";

const UPCOMING_STATUSES: readonly BookingStatus[] = [
  "CONFIRMED",
  "PENDING_DOCUMENTS",
  "DOCUMENTS_VERIFIED",
];

const DRAFT_STATUSES: readonly BookingStatus[] = [
  "ENQUIRY",
  "CAR_SELECTED",
  "DATES_SELECTED",
];

export type ActiveBookingReason = "PICKED_UP" | "UPCOMING" | "DRAFT" | "NONE";

export interface ActiveBookingResolution {
  /** The resolved booking, or null when there's none or the candidates are ambiguous. */
  booking: BookingRow | null;
  /** All equally-plausible bookings considered at the winning tier (length 1 unless ambiguous). */
  candidates: BookingRow[];
  /** True when more than one booking was equally plausible — the agent should ask which one. */
  ambiguous: boolean;
  reason: ActiveBookingReason;
}

function tied(
  candidates: BookingRow[],
  reason: ActiveBookingReason,
): ActiveBookingResolution {
  if (candidates.length === 1) {
    return { booking: candidates[0], candidates, ambiguous: false, reason };
  }
  return { booking: null, candidates, ambiguous: true, reason };
}

/**
 * Picks the single bookings this conversation is "about" right now, per
 * prompts/06-customer-memory-and-identification.md:
 * 1. A PICKED_UP booking wins outright (the customer is mid-rental).
 * 2. Else the nearest CONFIRMED/PENDING_DOCUMENTS/DOCUMENTS_VERIFIED booking
 *    (closest to `now`, so an overdue pickup still surfaces).
 * 3. Else the most recently created draft (ENQUIRY/CAR_SELECTED/DATES_SELECTED).
 * 4. Else null — RETURNED, COMPLETED, CANCELLED and NEEDS_HUMAN bookings are
 *    never "the active booking" (they're either done or already escalated).
 * Ties at any tier come back as `ambiguous: true` with every tied candidate,
 * so the caller can ask the customer which one they mean instead of guessing.
 */
function resolveActiveBookingFromList(
  bookings: BookingRow[],
  now: Date,
): ActiveBookingResolution {
  const pickedUp = bookings.filter((b) => b.status === "PICKED_UP");
  if (pickedUp.length > 0) return tied(pickedUp, "PICKED_UP");

  const upcoming = bookings.filter(
    (b) => UPCOMING_STATUSES.includes(b.status) && b.pickupAt,
  );
  if (upcoming.length > 0) {
    const nowMs = now.getTime();
    const distances = upcoming.map((b) => ({
      booking: b,
      distanceMs: Math.abs(new Date(b.pickupAt as string).getTime() - nowMs),
    }));
    const minDistance = Math.min(...distances.map((d) => d.distanceMs));
    const nearest = distances
      .filter((d) => d.distanceMs === minDistance)
      .map((d) => d.booking);
    return tied(nearest, "UPCOMING");
  }

  const drafts = bookings.filter((b) => DRAFT_STATUSES.includes(b.status));
  if (drafts.length > 0) {
    const latestMs = Math.max(
      ...drafts.map((b) => new Date(b.createdAt).getTime()),
    );
    const mostRecent = drafts.filter(
      (b) => new Date(b.createdAt).getTime() === latestMs,
    );
    return tied(mostRecent, "DRAFT");
  }

  return { booking: null, candidates: [], ambiguous: false, reason: "NONE" };
}

export async function resolveActiveBooking(
  db: DomainDb,
  customerId: string,
  now: Date,
): Promise<ActiveBookingResolution> {
  const bookings = await db.listBookingsForCustomer(customerId);
  return resolveActiveBookingFromList(bookings, now);
}

export interface CustomerContextDeps {
  domainDb: DomainDb;
  messaging: MessagingDb;
}

/**
 * Compact text block for the agent's system prompt: who this customer is,
 * which booking the conversation is about, what else is on file, and
 * anything already waiting on the team. Never invents anything not already
 * in the database (CLAUDE.md).
 */
export async function buildCustomerContextSummary(
  deps: CustomerContextDeps,
  customerId: string,
  now: Date,
): Promise<string> {
  const [customer, bookings] = await Promise.all([
    deps.messaging.getCustomerById(customerId),
    deps.domainDb.listBookingsForCustomer(customerId),
  ]);
  if (!customer) return "Unknown customer — no record on file.";

  const resolution = resolveActiveBookingFromList(bookings, now);
  const completedCount = bookings.filter(
    (b) => b.status === "COMPLETED",
  ).length;
  const resolvedIds = new Set(resolution.candidates.map((b) => b.id));
  const otherUpcoming = bookings.filter(
    (b) => UPCOMING_STATUSES.includes(b.status) && !resolvedIds.has(b.id),
  );
  const openNotifications =
    await deps.messaging.countOpenNotificationsForBookings(
      bookings.map((b) => b.id),
    );

  const lines = [
    describeCustomer(customer),
    describeActiveBookingLine(resolution),
  ];
  if (otherUpcoming.length > 0) {
    lines.push(
      `Other upcoming bookings: ${otherUpcoming
        .map((b) => `#${b.bookingNumber} (${b.status}, pickup ${b.pickupAt})`)
        .join(", ")}.`,
    );
  }
  lines.push(`Past completed rentals: ${completedCount}.`);
  lines.push(`Open items waiting on the team: ${openNotifications}.`);
  return lines.join("\n");
}

function describeCustomer(customer: CustomerRow): string {
  const name = customer.fullName ?? "(name not on file)";
  return `${name} (${customer.customerCode})`;
}

function describeActiveBookingLine(
  resolution: ActiveBookingResolution,
): string {
  if (resolution.ambiguous) {
    return `Multiple equally-plausible active bookings — ask the customer which one they mean: ${resolution.candidates
      .map((b) => `#${b.bookingNumber} (${b.status})`)
      .join(", ")}.`;
  }
  if (!resolution.booking) return "No active or upcoming booking on file.";
  const b = resolution.booking;
  return `Active booking: #${b.bookingNumber} (${b.status}).`;
}

export interface BookingIdentityVerification {
  verified: boolean;
  booking: BookingRow | null;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Checks a booking number + full name against the booking's actual customer
 * record, for a customer messaging from a number we don't recognise. Never
 * links anything itself — see requestNumberLink. Returns `verified: false`
 * for a missing booking, a customer with no name on file, or a mismatch, all
 * indistinguishable to the caller so a guesser can't use the response to
 * narrow down a real booking/name pair.
 */
export async function verifyBookingIdentity(
  deps: CustomerContextDeps,
  bookingNumber: number,
  fullName: string,
): Promise<BookingIdentityVerification> {
  const booking = await deps.domainDb.getBookingByNumber(bookingNumber);
  if (!booking) return { verified: false, booking: null };

  const owner = await deps.messaging.getCustomerById(booking.customerId);
  if (!owner?.fullName) return { verified: false, booking: null };

  const matches = normalizeName(owner.fullName) === normalizeName(fullName);
  return matches
    ? { verified: true, booking }
    : { verified: false, booking: null };
}

/**
 * Flags a verified "this is my booking, I'm messaging from a new number"
 * claim for a human to action — CLAUDE.md: the AI never changes who a
 * booking/customer record belongs to on its own.
 */
export async function requestNumberLink(
  messaging: MessagingDb,
  params: {
    newWhatsappNumber: string;
    booking: BookingRow;
    claimedFullName: string;
  },
): Promise<void> {
  await messaging.createOwnerNotification({
    type: "OTHER",
    title: `Link WhatsApp number to booking #${params.booking.bookingNumber}`,
    body: `${params.newWhatsappNumber} says they are ${params.claimedFullName}, re: booking #${params.booking.bookingNumber}. Name matched the booking's customer record — approve linking this number if correct.`,
    bookingId: params.booking.id,
  });
}
