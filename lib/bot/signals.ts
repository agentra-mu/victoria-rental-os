import type { ClassifyResult } from "@/lib/llm/tasks";
import { fleetOptions } from "./booking";
import type { TurnCtx } from "./context";
import { parseCar } from "./parsers/car";
import { parseWhen } from "./parsers/datetime";
import { parseLocation } from "./parsers/location";

type Extracted = ClassifyResult["extracted"];

const MON = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const phrase = (isoDate: string, time?: string) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d} ${MON[m - 1]} ${y}${time ? ` ${time}` : ""}`;
};

/**
 * Rule-based slot finder for a whole sentence: runs the car, date and place
 * parsers over the full text ("the Vitz from tomorrow 9am for 3 days at the
 * airport") and returns the details as the same phrases the model would give,
 * ready for the step parsers. No model involved; null when nothing was found.
 */
export async function ruleExtract(
  ctx: TurnCtx,
  text: string,
): Promise<Extracted | null> {
  const out: Extracted = {};

  const car = parseCar(text, await fleetOptions(ctx), ctx.cfg);
  if (car.ok) out.car = `${car.value.make} ${car.value.model}`;

  const when = parseWhen(text, { now: ctx.now, lang: ctx.lang });
  if (when.ok) {
    const v = when.value;
    if (v.date) out.pickup_datetime = phrase(v.date, v.time);
    else if (v.time) out.pickup_datetime = v.time;
    if (v.endDate) out.return_datetime = phrase(v.endDate, v.endTime);
    if (v.durationDays !== undefined) out.duration = `${v.durationDays} days`;
  }

  const locations = (await ctx.displayDb.listActiveLocations()).filter(
    (l) => l.isPickup,
  );
  const aliases = await ctx.catalog.listLocationAliases();
  const place = parseLocation(text, locations, aliases, ctx.cfg);
  if (place.ok) out.pickup_location = place.value.name;

  return Object.keys(out).length > 0 ? out : null;
}

/** Does the message contain anything the rules recognise as a booking detail (a date, a car, a place)? */
export async function hasSlotSignals(
  ctx: TurnCtx,
  text: string,
): Promise<boolean> {
  if (await ruleExtract(ctx, text)) return true;
  const when = parseWhen(text, { now: ctx.now, lang: ctx.lang });
  return !when.ok && when.reason !== "NO_MATCH";
}
