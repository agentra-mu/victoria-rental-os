/**
 * Every interactive button / list row the bot sends carries one of these
 * machine IDs, and the structured-input layer routes on them directly — no
 * text interpretation (see layers/structured.ts).
 */
export const IDS = {
  menu: {
    viewCars: "menu:view_cars",
    checkAvailability: "menu:check_availability",
    existingBooking: "menu:existing_booking",
    talkHuman: "menu:talk_human",
    main: "menu:main",
  },
  confirm: {
    yes: "confirm:yes",
    change: "confirm:change",
    cancel: "confirm:cancel",
  },
  req: {
    delay: "req:delay",
    extension: "req:extension",
    pickupChange: "req:pickup_change",
    cancel: "req:cancel",
  },
  nav: { back: "nav:back" },
  faq: { helpful: "faq:helpful", notHelpful: "faq:not_helpful" },
  change: {
    car: "chg:car",
    dates: "chg:dates",
    pickup: "chg:pickup",
    dropoff: "chg:dropoff",
    name: "chg:name",
  },
  name: { keep: "name:keep" },
  loc: { same: "loc:same" },
} as const;

export type IdKind =
  | "menu"
  | "confirm"
  | "req"
  | "nav"
  | "faq"
  | "chg"
  | "name"
  | "car"
  | "loc"
  | "date"
  | "time"
  | "bk";

export const carId = (vehicleId: string) => `car:${vehicleId}`;
export const locId = (locationId: string) => `loc:${locationId}`;
export const dateId = (isoDate: string) => `date:${isoDate}`;
export const timeId = (hhmm: string) => `time:${hhmm}`;
export const bookingPickId = (bookingId: string) => `bk:${bookingId}`;

export interface ParsedId {
  kind: IdKind;
  value: string;
  raw: string;
}

const KINDS = new Set<string>([
  "menu",
  "confirm",
  "req",
  "nav",
  "faq",
  "chg",
  "name",
  "car",
  "loc",
  "date",
  "time",
  "bk",
]);

/** Ids from the pre-refactor agent that may still sit in customers' chat history. */
const LEGACY: Record<string, string> = {
  menu_view_cars: IDS.menu.viewCars,
  menu_check_availability: IDS.menu.checkAvailability,
  menu_existing_booking: IDS.menu.existingBooking,
  menu_talk_human: IDS.menu.talkHuman,
  confirm_booking: IDS.confirm.yes,
  change_details: IDS.confirm.change,
  cancel_booking: IDS.confirm.cancel,
};

export function parseId(raw: string): ParsedId | null {
  const id = LEGACY[raw] ?? raw;
  const idx = id.indexOf(":");
  if (idx <= 0) return null;
  const kind = id.slice(0, idx);
  if (!KINDS.has(kind)) return null;
  return { kind: kind as IdKind, value: id.slice(idx + 1), raw: id };
}
