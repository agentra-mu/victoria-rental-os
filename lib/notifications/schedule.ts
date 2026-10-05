import { localParts } from "@/lib/domain/openingHours";

export type MessageKind =
  | "pickup_reminder"
  | "pickup_day"
  | "return_reminder"
  | "thank_you"
  | "docs_nudge_1"
  | "docs_nudge_2"
  | "docs_owner_alert";

export interface ScheduleBooking {
  id: string;
  customerId: string;
  status: string;
  pickupAt: string | null;
  returnAt: string | null;
  /** When the booking entered PENDING_DOCUMENTS (from booking_events). */
  pendingDocumentsSince: string | null;
  documentStatus: string;
  optedOut: boolean;
}

export interface DueMessage {
  bookingId: string;
  customerId: string;
  kind: MessageKind;
}

const HOUR = 3600_000;
const DAY_KEY = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: "Indian/Mauritius" });

export const PICKUP_REMINDER_HOUR = 18;
export const RETURN_REMINDER_HOUR = 8;
export const DIGEST_MINUTES = 7 * 60 + 30;

/** The local date key one day before `d`'s local date. */
function dayBefore(d: Date): string {
  return DAY_KEY(new Date(d.getTime() - 24 * HOUR));
}

/**
 * Which customer messages are due right now. Pure: callers pass the set of
 * "bookingId:kind" already sent so nothing is ever sent twice.
 */
export function computeDueMessages(
  bookings: ScheduleBooking[],
  alreadySent: Set<string>,
  now: Date,
): DueMessage[] {
  const due: DueMessage[] = [];
  const today = DAY_KEY(now);
  const nowMinutes = localParts(now).minutes;
  const add = (b: ScheduleBooking, kind: MessageKind) => {
    if (alreadySent.has(`${b.id}:${kind}`)) return;
    due.push({ bookingId: b.id, customerId: b.customerId, kind });
  };

  for (const b of bookings) {
    const pickup = b.pickupAt ? new Date(b.pickupAt) : null;
    const ret = b.returnAt ? new Date(b.returnAt) : null;
    const upcoming = ["DOCUMENTS_VERIFIED", "CONFIRMED"].includes(b.status);

    // Docs nudges go to the customer; the owner alert is internal and ignores opt-out.
    if (
      b.status === "PENDING_DOCUMENTS" &&
      b.pendingDocumentsSince &&
      b.documentStatus === "NOT_SUBMITTED"
    ) {
      const hours =
        (now.getTime() - Date.parse(b.pendingDocumentsSince)) / HOUR;
      if (hours >= 72) add(b, "docs_owner_alert");
      if (!b.optedOut) {
        if (hours >= 48) add(b, "docs_nudge_2");
        else if (hours >= 24) add(b, "docs_nudge_1");
      }
    }
    if (b.optedOut) continue;

    if (upcoming && pickup && pickup.getTime() > now.getTime()) {
      // Day before at 18:00 Mauritius time (and still before pickup).
      if (
        dayBefore(pickup) === today &&
        nowMinutes >= PICKUP_REMINDER_HOUR * 60
      )
        add(b, "pickup_reminder");
      else if (dayBefore(pickup) < today) add(b, "pickup_reminder"); // missed window (late booking) — send once
      // 2 hours before pickup.
      if (pickup.getTime() - now.getTime() <= 2 * HOUR) add(b, "pickup_day");
    }
    if (
      b.status === "PICKED_UP" &&
      ret &&
      DAY_KEY(ret) === today &&
      nowMinutes >= RETURN_REMINDER_HOUR * 60 &&
      ret.getTime() > now.getTime()
    ) {
      add(b, "return_reminder");
    }
    if (
      ["RETURNED", "COMPLETED"].includes(b.status) &&
      ret &&
      now.getTime() - ret.getTime() < 7 * 24 * HOUR
    ) {
      add(b, "thank_you");
    }
  }
  return due;
}

/** The owner digest is due once per local day, from 07:30. */
export function isDigestDue(now: Date, lastDigestDay: string | null): boolean {
  return (
    localParts(now).minutes >= DIGEST_MINUTES && lastDigestDay !== DAY_KEY(now)
  );
}

export const digestDayKey = DAY_KEY;
