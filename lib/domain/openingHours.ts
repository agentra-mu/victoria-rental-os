import { TIMEZONE } from "./config";

/** Local (Indian/Mauritius) open/close per weekday as "HH:MM"; null/missing = closed. */
export type OpeningHours = Partial<
  Record<
    "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
    [string, string] | null
  >
>;

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/** Local weekday key and minutes-since-midnight for an instant, in Mauritius time. */
export function localParts(instant: Date): {
  day: DayKey;
  minutes: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const weekday = parts.find((p) => p.type === "weekday")!.value.toLowerCase();
  const hour = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")!.value);
  return {
    day: weekday.slice(0, 3) as DayKey,
    minutes: hour * 60 + minute,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** No opening hours configured = always open. */
export function isWithinOpeningHours(
  hours: OpeningHours | null | undefined,
  instant: Date,
): boolean {
  if (!hours || Object.keys(hours).length === 0) return true;
  const { day, minutes } = localParts(instant);
  const window = hours[day];
  if (!window) return false;
  return minutes >= toMinutes(window[0]) && minutes <= toMinutes(window[1]);
}

export interface AfterHoursResult {
  afterHours: boolean;
  allowed: boolean;
  feeRs: number;
}

export function checkAfterHours(
  location: {
    openingHours?: OpeningHours | null;
    afterHoursAllowed?: boolean;
    afterHoursFeeRs?: number;
  },
  instant: Date,
): AfterHoursResult {
  if (isWithinOpeningHours(location.openingHours, instant)) {
    return { afterHours: false, allowed: true, feeRs: 0 };
  }
  const allowed = location.afterHoursAllowed ?? false;
  return {
    afterHours: true,
    allowed,
    feeRs: allowed ? (location.afterHoursFeeRs ?? 0) : 0,
  };
}
