export interface Span {
  startAt: string;
  endAt: string;
}

const DAY = 86400_000;

/** Mauritius is UTC+4 with no DST, so local midnight = 20:00 UTC the day before. */
export function localMidnight(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00+04:00`);
}

export function dayKeys(startKey: string, days: number): string[] {
  const start = localMidnight(startKey).getTime();
  return Array.from({ length: days }, (_, i) =>
    new Date(start + i * DAY + 4 * 3600_000).toISOString().slice(0, 10),
  );
}

/**
 * 1-based CSS grid column lines [start, end) for a span within the visible
 * range, clipped to it, or null if it doesn't intersect.
 */
export function barColumns(
  span: Span,
  rangeStartKey: string,
  days: number,
): { start: number; end: number } | null {
  const rangeStart = localMidnight(rangeStartKey).getTime();
  const rangeEnd = rangeStart + days * DAY;
  const s = Math.max(Date.parse(span.startAt), rangeStart);
  const e = Math.min(Date.parse(span.endAt), rangeEnd);
  if (e <= s) return null;
  const start = Math.floor((s - rangeStart) / DAY);
  const end = Math.max(start + 1, Math.ceil((e - rangeStart) / DAY));
  return { start: start + 1, end: end + 1 };
}

/** Fraction (0–1) of the visible range this vehicle is booked (maintenance excluded from "booked"). */
export function utilisation(
  bookings: Span[],
  rangeStartKey: string,
  days: number,
): number {
  const rangeStart = localMidnight(rangeStartKey).getTime();
  const rangeEnd = rangeStart + days * DAY;
  let ms = 0;
  for (const b of bookings) {
    const s = Math.max(Date.parse(b.startAt), rangeStart);
    const e = Math.min(Date.parse(b.endAt), rangeEnd);
    if (e > s) ms += e - s;
  }
  return Math.min(1, ms / (rangeEnd - rangeStart));
}
