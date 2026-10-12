import * as chrono from "chrono-node";
import { DATE_WORDS } from "../lexicon";
import { normalize } from "../text";
import type { Lang } from "../types";
import {
  MAURITIUS_OFFSET_MINUTES,
  addDays,
  hhmmToMinutes,
  isRealDate,
  localDate,
  localMinutes,
  pad2,
  ymd,
} from "./localTime";
import { fail, ok, type ParseResult } from "./types";

/** What one message told us. Dates are "YYYY-MM-DD", times "HH:mm", all Mauritius wall-clock. */
export interface WhenValue {
  date?: string;
  time?: string;
  endDate?: string;
  endTime?: string;
  /** "5 days" / "3 nuits": a rental length, only meaningful for the return step. */
  durationDays?: number;
}

export type WhenFailureReason =
  "NO_MATCH" | "PAST_DATE" | "AMBIGUOUS_DATE" | "AMBIGUOUS_TIME";

interface Found<T> {
  index: number;
  length: number;
  value: T;
}

const MONTHS =
  "jan|feb|fev|mar|apr|avr|may|mai|jun|juin|jul|juil|aug|aou|sep|oct|nov|dec";
const MONTH_AFTER = new RegExp(`^\\s*(?:de\\s+)?(?:${MONTHS})`, "i");

function blank(text: string, index: number, length: number): string {
  return text.slice(0, index) + " ".repeat(length) + text.slice(index + length);
}

interface TimeHit {
  time?: string;
  /** Candidates when am/pm is missing. */
  ambiguous?: string[];
}

/** Pulls every time-of-day out of `text`, returning the text with them blanked out. */
function extractTimes(
  input: string,
  lang: Lang,
): { text: string; times: Found<TimeHit>[] } {
  let text = input;
  const times: Found<TimeHit>[] = [];
  const take = (re: RegExp, build: (m: RegExpExecArray) => TimeHit | null) => {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      const value = build(m);
      if (!value) continue;
      times.push({ index: m.index, length: m[0].length, value });
      text = blank(text, m.index, m[0].length);
      re.lastIndex = 0;
    }
  };

  const clock = (h: number, min: number, meridiem?: string): TimeHit | null => {
    if (min > 59) return null;
    if (meridiem) {
      if (h < 1 || h > 12) return null;
      const hh = (h % 12) + (meridiem === "pm" ? 12 : 0);
      return { time: `${pad2(hh)}:${pad2(min)}` };
    }
    if (h > 23) return null;
    return { time: `${pad2(h)}:${pad2(min)}` };
  };
  const bare = (
    h: number,
    min: number,
    leadingZero: boolean,
  ): TimeHit | null => {
    if (min > 59 || h > 23) return null;
    if (h === 0 || h >= 13 || leadingZero)
      return { time: `${pad2(h)}:${pad2(min)}` };
    // 1–12 with no am/pm: never guess.
    return {
      ambiguous: [
        `${pad2(h % 12)}:${pad2(min)}`,
        `${pad2((h % 12) + 12)}:${pad2(min)}`,
      ],
    };
  };

  // 9:30pm, 9.30 pm (with meridiem), 9:30, 09:30
  take(/\b(\d{1,2})[:h](\d{2})\s*(am|pm)?(?![\d/])/g, (m) => {
    const h = Number(m[1]);
    return m[3]
      ? clock(h, Number(m[2]), m[3])
      : bare(h, Number(m[2]), m[1].startsWith("0") && m[1].length === 2);
  });
  // 9am, 9 pm
  take(/\b(\d{1,2})\s*(am|pm)\b/g, (m) => clock(Number(m[1]), 0, m[2]));
  // 9h (French 24h clock: "9h" is 09:00, "17h" is 17:00)
  take(/\b(\d{1,2})\s*h\b/g, (m) => clock(Number(m[1]), 0));
  // noon / midi
  const noonWords = [...DATE_WORDS.noon.en, ...DATE_WORDS.noon.fr]
    .map(normalize)
    .join("|");
  take(new RegExp(`\\b(?:${noonWords})\\b`, "g"), () => ({ time: "12:00" }));
  // A message that is only a number ("9") is a time with no am/pm.
  take(/^\s*(\d{1,2})\s*$/g, (m) =>
    bare(Number(m[1]), 0, m[1].startsWith("0") && m[1].length === 2),
  );
  // "at 9", "a 9", "vers 9" — only when the number isn't a day ("at 9 oct")
  const at = lang === "fr" ? "(?:a|vers|vers les)" : "(?:at|around)";
  take(new RegExp(`\\b${at}\\s+(\\d{1,2})\\b(?!\\s*[:/.])`, "g"), (m) => {
    const after = text.slice(m.index + m[0].length);
    if (MONTH_AFTER.test(after)) return null;
    return bare(Number(m[1]), 0, false);
  });

  times.sort((a, b) => a.index - b.index);
  return { text, times };
}

interface DateHit {
  date: string;
  ambiguousWith?: string;
}

/** Day/month a bare number pair can mean, rolled forward to the next occurrence. */
function rollForward(day: number, month: number, today: string): string | null {
  const [ty] = today.split("-").map(Number);
  for (const year of [ty, ty + 1]) {
    if (!isRealDate(year, month, day)) continue;
    const candidate = ymd(year, month, day);
    if (candidate >= today) return candidate;
  }
  return null;
}

function extractNumericDates(
  input: string,
  today: string,
): { text: string; dates: Found<DateHit>[] } {
  let text = input;
  const dates: Found<DateHit>[] = [];
  const re = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const yearRaw = m[3] ? Number(m[3]) : undefined;
    const year =
      yearRaw === undefined
        ? undefined
        : yearRaw < 100
          ? 2000 + yearRaw
          : yearRaw;
    const resolve = (day: number, month: number) =>
      year !== undefined
        ? isRealDate(year, month, day)
          ? ymd(year, month, day)
          : null
        : rollForward(day, month, today);

    let hit: DateHit | null = null;
    if (a > 12 && b <= 12) {
      const d = resolve(a, b);
      if (d) hit = { date: d };
    } else if (b > 12 && a <= 12) {
      const d = resolve(b, a); // 10/25 → month first
      if (d) hit = { date: d };
    } else if (a <= 12 && b <= 12) {
      const dm = resolve(a, b); // DD/MM, the Mauritian convention
      const md = resolve(b, a);
      // A reading in the past can't be a booking, so only future readings compete.
      const live = [dm, md].filter((d): d is string => !!d && d >= today);
      if (a === b && dm) hit = { date: dm };
      else if (live.length === 2)
        hit = { date: dm as string, ambiguousWith: md as string };
      else if (live.length === 1) hit = { date: live[0] };
      else if (dm || md) hit = { date: (dm ?? md) as string };
    }
    if (!hit) continue;
    dates.push({ index: m.index, length: m[0].length, value: hit });
    text = blank(text, m.index, m[0].length);
    re.lastIndex = 0;
  }
  return { text, dates };
}

function extractRelativeDates(
  input: string,
  today: string,
): { text: string; dates: Found<DateHit>[] } {
  let text = input;
  const dates: Found<DateHit>[] = [];
  const groups: [string[], number][] = [
    [[...DATE_WORDS.dayAfterTomorrow.en, ...DATE_WORDS.dayAfterTomorrow.fr], 2],
    [[...DATE_WORDS.tomorrow.en, ...DATE_WORDS.tomorrow.fr], 1],
    [[...DATE_WORDS.today.en, ...DATE_WORDS.today.fr], 0],
  ];
  for (const [words, offset] of groups) {
    const re = new RegExp(
      `\\b(?:${words.map((w) => normalize(w)).join("|")})\\b`,
      "g",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      dates.push({
        index: m.index,
        length: m[0].length,
        value: { date: addDays(today, offset) },
      });
      text = blank(text, m.index, m[0].length);
      re.lastIndex = 0;
    }
  }
  return { text, dates };
}

function chronoParse(text: string, today: string, lang: Lang) {
  // Anchor at local midnight so forwardDate only rolls dates strictly before today.
  const ref = {
    instant: new Date(`${today}T00:00:00+04:00`),
    timezone: MAURITIUS_OFFSET_MINUTES,
  };
  const order = lang === "fr" ? [chrono.fr, chrono.en] : [chrono.en, chrono.fr];
  for (const parser of order) {
    const results = parser
      .parse(text, ref, { forwardDate: true })
      .filter((r) => r.start.isCertain("day") || r.start.isCertain("weekday"));
    if (results.length > 0) return results;
  }
  return [];
}

function ymdOf(c: {
  get(k: "year" | "month" | "day"): number | null;
}): string | null {
  const y = c.get("year");
  const m = c.get("month");
  const d = c.get("day");
  return y && m && d ? ymd(y, m, d) : null;
}

/**
 * Deterministic date/time/range parser (English + French), resolved against
 * `now` on the Indian/Mauritius wall clock. It never guesses: a missing
 * am/pm, a 03/04-style date, or a date in the past comes back as a typed
 * failure so the flow can ask a templated clarifying question.
 *
 * Examples: "tomorrow", "next Friday", "12/10", "12 Oct 9am", "demain",
 * "12 to 17 Oct", "du 12 au 17 octobre", "9h", "in 3 days".
 */
export function parseWhen(
  input: string,
  opts: { now: Date; lang?: Lang },
): ParseResult<WhenValue, WhenFailureReason> {
  const lang = opts.lang ?? "en";
  const today = localDate(opts.now);
  let text = normalize(input);
  if (!text) return fail("NO_MATCH");

  // "5 days", "3 nuits" — a rental length (but not "in 3 days", which is a date).
  let durationDays: number | undefined;
  const dur =
    /(?<!\b(?:in|dans)\s)\b(\d{1,2})\s*(?:days?|jours?|nights?|nuits?)\b/.exec(
      text,
    );
  if (dur) {
    durationDays = Number(dur[1]);
    text = blank(text, dur.index, dur[0].length);
  }

  // "yesterday", "last Monday", "lundi dernier": clearly the past — never roll these forward.
  if (
    /\b(?:yesterday|hier)\b|\blast\s+(?:mon|tue|wed|thu|fri|sat|sun|week|month|year)|\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaine|mois)\s+(?:dernier|derniere|passe|passee)\b/.test(
      text,
    )
  ) {
    return fail("PAST_DATE", { date: null });
  }

  const timePass = extractTimes(text, lang);
  text = timePass.text;
  const relative = extractRelativeDates(text, today);
  text = relative.text;
  const numeric = extractNumericDates(text, today);
  text = numeric.text;

  const found: Found<DateHit>[] = [...relative.dates, ...numeric.dates];
  let chronoEnd: string | undefined;
  for (const r of chronoParse(text, today, lang)) {
    const start = ymdOf(r.start);
    if (!start) continue;
    found.push({
      index: r.index,
      length: r.text.length,
      value: { date: start },
    });
    const end = r.end ? ymdOf(r.end) : null;
    if (end) chronoEnd = end;
  }
  found.sort((a, b) => a.index - b.index);

  const value: WhenValue = {};
  if (durationDays !== undefined) value.durationDays = durationDays;

  const first = found[0]?.value;
  if (first) {
    if (first.ambiguousWith) {
      return fail("AMBIGUOUS_DATE", {
        options: [first.date, first.ambiguousWith],
        time: timePass.times[0]?.value.time,
      });
    }
    value.date = first.date;
    value.endDate = found[1]?.value.date ?? chronoEnd;
  }

  const t1 = timePass.times[0]?.value;
  const t2 = timePass.times[1]?.value;
  if (t1?.ambiguous || t2?.ambiguous) {
    return fail("AMBIGUOUS_TIME", {
      options: (t1?.ambiguous ?? t2?.ambiguous) as string[],
      partial: value,
      which: t1?.ambiguous ? "start" : "end",
    });
  }
  if (t1?.time) value.time = t1.time;
  if (t2?.time) value.endTime = t2.time;

  if (
    value.date === undefined &&
    value.time === undefined &&
    value.durationDays === undefined
  ) {
    return fail("NO_MATCH");
  }

  const pastDate = [value.date, value.endDate].find((d) => d && d < today);
  if (pastDate) return fail("PAST_DATE", { date: pastDate });
  if (
    value.date === today &&
    value.time &&
    hhmmToMinutes(value.time) <= localMinutes(opts.now)
  ) {
    return fail("PAST_DATE", { date: today, time: value.time });
  }

  return ok(value);
}
