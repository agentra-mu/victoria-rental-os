import { normalize } from "../text";

/**
 * "2 hours", "30 min", "1h30", "2 heures" → minutes late. Returns null when
 * the message isn't a duration (the caller then tries a date/time instead).
 */
export function parseDelayMinutes(input: string): number | null {
  const text = normalize(input);
  const hm = /\b(\d{1,2})\s*h\s*(\d{2})\b/.exec(text);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);

  let minutes = 0;
  let matched = false;
  const hours =
    /\b(\d{1,2}(?:[.,]\d)?)\s*(?:h|hr|hrs|hour|hours|heure|heures)\b/.exec(
      text,
    );
  if (hours) {
    minutes += Math.round(Number(hours[1].replace(",", ".")) * 60);
    matched = true;
  }
  const mins = /\b(\d{1,3})\s*(?:m|min|mins|minute|minutes)\b/.exec(text);
  if (mins) {
    minutes += Number(mins[1]);
    matched = true;
  }
  if (/\b(?:half an hour|une demi heure|demi-heure)\b/.test(text)) {
    minutes += 30;
    matched = true;
  }
  return matched && minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}
