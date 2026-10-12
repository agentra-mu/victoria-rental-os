import { TIMEZONE } from "@/lib/domain/config";

/** Mauritius is UTC+4 all year (no DST). */
export const MAURITIUS_OFFSET_MINUTES = 240;

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "YYYY-MM-DD" of `now` on the Mauritius wall clock. */
export function localDate(now: Date): string {
  return dateFmt.format(now);
}

/** Minutes since local midnight. */
export function localMinutes(now: Date): number {
  const [h, m] = timeFmt.format(now).split(":").map(Number);
  return (h % 24) * 60 + m;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** True for a real calendar date ("2026-02-30" is not). */
export function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Local wall-clock date + time → UTC ISO instant (CLAUDE.md: store UTC). */
export function toInstantIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+04:00`).toISOString();
}

/** UTC instant → local { date, time } wall-clock parts. */
export function fromInstant(value: Date | string): {
  date: string;
  time: string;
} {
  const d = new Date(value);
  return {
    date: dateFmt.format(d),
    time: timeFmt.format(d).replace(/^24:/, "00:"),
  };
}

const LABEL_LOCALES = { en: "en-GB", fr: "fr-FR" } as const;

/** "Mon 12 Oct" / "lun. 12 oct." for a local date. */
export function dateLabel(isoDate: string, lang: "en" | "fr"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(LABEL_LOCALES[lang], {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: y === new Date().getUTCFullYear() ? undefined : "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "9:00 am" (en) or "09:00" (fr). */
export function timeLabel(hhmm: string, lang: "en" | "fr"): string {
  if (lang === "fr") return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${suffix}`;
}
