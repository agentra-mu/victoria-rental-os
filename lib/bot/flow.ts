import { UPLOAD_TOKEN_TTL_HOURS } from "@/lib/domain/config";
import { confirmBooking } from "@/lib/domain/confirmBooking";
import { getAvailableVehicles } from "@/lib/domain/getAvailableVehicles";
import { updateBookingDraft } from "@/lib/domain/updateBookingDraft";
import type { LocationRow } from "@/lib/domain/ports";
import { textReply, type WhatsAppReply } from "@/lib/whatsapp/replies";
import {
  cancelOwnDraft,
  explainDomainError,
  resetFlowState,
  type Outcome,
} from "./actions";
import {
  availableOptions,
  buildSummary,
  ensureDraft,
  fleetOptions,
  loadDraft,
} from "./booking";
import type { TurnCtx } from "./context";
import { IDS, type IdKind, type ParsedId } from "./ids";
import { SAME_LOCATION } from "./lexicon";
import { normalize } from "./text";
import { parseCar } from "./parsers/car";
import { parseWhen, type WhenValue } from "./parsers/datetime";
import { parseLocation } from "./parsers/location";
import { parseFullName } from "./parsers/name";
import {
  addDays,
  dateLabel,
  fromInstant,
  hhmmToMinutes,
  localDate,
  localMinutes,
  timeLabel,
  toInstantIso,
} from "./parsers/localTime";
import { handleChangeParse, changePrompt, applyChange } from "./changeRequest";
import { buildStatusCard } from "./booking";
import type { Step } from "./types";

export type StepInput =
  { kind: "button"; id: ParsedId } | { kind: "text"; text: string };

export type StepParse =
  | { ok: true; value: unknown }
  | {
      ok: false;
      reason: string;
      replies: WhatsAppReply[];
      /** A clarifying question, not a mistake: don't count it as a failed attempt. */
      noRetry?: boolean;
    };

export interface StepHandler {
  /** Button id kinds this step understands (anything else is a stale button). */
  accepts: IdKind[];
  prompt(ctx: TurnCtx): Promise<WhatsAppReply[]>;
  /** Absent = this step takes no free text (menu-like). */
  parse?(input: StepInput, ctx: TurnCtx): Promise<StepParse>;
  onValid?(value: never, ctx: TurnCtx): Promise<Outcome>;
}

const label = (ctx: TurnCtx, date: string, time?: string) =>
  `${dateLabel(date, ctx.lang)}${time ? ` ${timeLabel(time, ctx.lang)}` : ""}`;

const isPast = (ctx: TurnCtx, date: string, time: string) =>
  date < localDate(ctx.now) ||
  (date === localDate(ctx.now) && hhmmToMinutes(time) <= localMinutes(ctx.now));

/* ---------------------------------------------------------------- dates */

type Field = "pickup" | "return";

function setField(
  ctx: TurnCtx,
  field: Field,
  part: "Date" | "Time",
  value: string | undefined,
) {
  (ctx.state.pending as Record<string, string | undefined>)[`${field}${part}`] =
    value;
}

/** Reads a date/time message or button into pending state; returns a reply when the customer must clarify. */
async function readWhen(
  input: StepInput,
  ctx: TurnCtx,
  field: Field,
): Promise<StepParse> {
  if (input.kind === "button") {
    if (input.id.kind === "date") setField(ctx, field, "Date", input.id.value);
    if (input.id.kind === "time") setField(ctx, field, "Time", input.id.value);
    return { ok: true, value: "merged" };
  }

  const r = parseWhen(input.text, { now: ctx.now, lang: ctx.lang });
  if (!r.ok) {
    ctx.parsed.whenFailure = r.reason;
    if (r.reason === "PAST_DATE") {
      return { ok: false, reason: r.reason, replies: [ctx.t.datePast()] };
    }
    if (r.reason === "AMBIGUOUS_DATE") {
      const d = r.detail as { options: [string, string]; time?: string };
      setField(ctx, field, "Date", undefined);
      setField(ctx, field, "Time", d.time);
      return {
        ok: false,
        reason: r.reason,
        noRetry: true,
        replies: [
          ctx.t.askWhichDate(
            d.options.map((iso) => ({ iso, label: dateLabel(iso, ctx.lang) })),
          ),
        ],
      };
    }
    if (r.reason === "AMBIGUOUS_TIME") {
      const d = r.detail as { options: string[]; partial: WhenValue };
      if (d.partial.date) {
        setField(ctx, field, "Date", d.partial.date);
        if (field === "pickup" && d.partial.endDate)
          ctx.state.pending.returnDate = d.partial.endDate;
      }
      setField(ctx, field, "Time", undefined);
      return {
        ok: false,
        reason: r.reason,
        noRetry: true,
        replies: [ctx.t.askMeridiem(d.options)],
      };
    }
    return {
      ok: false,
      reason: r.reason,
      replies: [ctx.t.dateNotUnderstood()],
    };
  }

  const v = r.value;
  ctx.parsed.when = v;
  const p = ctx.state.pending;
  if (v.durationDays !== undefined && field === "return" && p.pickupDate) {
    p.returnDate = addDays(p.pickupDate, v.durationDays);
    p.returnTime = p.pickupTime;
    return { ok: true, value: "merged" };
  }
  if (v.durationDays !== undefined && !v.date && !v.time) {
    return {
      ok: false,
      reason: "NO_MATCH",
      replies: [ctx.t.dateNotUnderstood()],
    };
  }
  if (v.date) {
    setField(ctx, field, "Date", v.date);
    setField(ctx, field, "Time", v.time); // a fresh date never inherits a stale time
    if (field === "pickup" && v.endDate) {
      p.returnDate = v.endDate;
      p.returnTime = v.endTime;
    }
  } else if (v.time) {
    setField(ctx, field, "Time", v.time);
  }
  return { ok: true, value: "merged" };
}

/** Pushes complete pickup/return into the draft (or lists free cars when no car chosen yet). */
async function completeDates(ctx: TurnCtx): Promise<Outcome> {
  const p = ctx.state.pending;
  const pickupAt = toInstantIso(p.pickupDate as string, p.pickupTime as string);
  const returnAt = toInstantIso(p.returnDate as string, p.returnTime as string);

  if (new Date(returnAt) <= new Date(pickupAt)) {
    p.returnDate = undefined;
    p.returnTime = undefined;
    return {
      replies: [ctx.t.returnBeforePickup()],
      next: "RETURN_DATETIME",
      skipPrompt: true,
    };
  }
  ctx.parsed.pickupAt = pickupAt;
  ctx.parsed.returnAt = returnAt;

  if (!ctx.state.vehicleId) {
    let options;
    try {
      options = await availableOptions(ctx, pickupAt, returnAt);
    } catch (error) {
      const out = await explainDomainError(ctx, error, {
        step: "PICKUP_DATETIME",
      });
      if (out) return out;
      throw error;
    }
    if (options.length === 0) {
      ctx.state.pending = {};
      return {
        replies: [ctx.t.noAvailabilityForDates()],
        next: "MENU",
        skipPrompt: true,
      };
    }
    return {
      replies: [ctx.t.carList(options, "available")],
      next: "CHOOSE_CAR",
      skipPrompt: true,
    };
  }

  const draftId = await ensureDraft(ctx);
  const attempt = (vehicleId: string) =>
    updateBookingDraft(
      ctx.db,
      draftId,
      { vehicleId, pickupAt, returnAt },
      ctx.now,
    );
  try {
    try {
      await attempt(ctx.state.vehicleId);
    } catch (error) {
      if ((error as { code?: string }).code !== "VEHICLE_UNAVAILABLE")
        throw error;
      // Another vehicle of the same model may be free: swap silently.
      const current = await ctx.db.getVehicleById(ctx.state.vehicleId);
      const free = await getAvailableVehicles(ctx.db, { pickupAt, returnAt });
      const sibling = free.find(
        (g) => g.make === current?.make && g.model === current?.model,
      );
      if (!sibling) throw error;
      ctx.state.vehicleId = sibling.vehicleIds[0];
      await attempt(ctx.state.vehicleId);
    }
  } catch (error) {
    const out = await explainDomainError(ctx, error, {
      step: "PICKUP_DATETIME",
      pickupAt,
      returnAt,
      vehicleId: ctx.state.vehicleId,
    });
    if (out) return out;
    throw error;
  }
  ctx.state.pending = {};
  return {
    replies: [],
    next: ctx.state.returnToSummary ? "SUMMARY" : "PICKUP_LOCATION",
  };
}

/* ---------------------------------------------------------------- steps */

const pickupLocations = async (ctx: TurnCtx) =>
  (await ctx.displayDb.listActiveLocations()).filter((l) => l.isPickup);
const dropoffLocations = async (ctx: TurnCtx) =>
  (await ctx.displayDb.listActiveLocations()).filter((l) => l.isDropoff);

async function readLocation(
  input: StepInput,
  ctx: TurnCtx,
  pool: LocationRow[],
): Promise<StepParse> {
  if (input.kind === "button") {
    if (input.id.kind === "loc" && input.id.value === "same")
      return { ok: true, value: "same" };
    const found = pool.find((l) => l.id === input.id.value);
    return found
      ? { ok: true, value: found }
      : {
          ok: false,
          reason: "STALE",
          replies: [ctx.t.locationNotUnderstood(pool)],
        };
  }
  if (SAME_LOCATION.some((w) => normalize(w) === normalize(input.text))) {
    return { ok: true, value: "same" };
  }
  const aliases = await ctx.catalog.listLocationAliases();
  const r = parseLocation(input.text, pool, aliases, ctx.cfg);
  if (r.ok) {
    ctx.parsed.location = r.value.name;
    return r;
  }
  if (r.reason === "AMBIGUOUS") {
    const options = (r.detail as { options: LocationRow[] }).options;
    return {
      ok: false,
      reason: r.reason,
      noRetry: true,
      replies: [ctx.t.locationAmbiguous(options)],
    };
  }
  return {
    ok: false,
    reason: r.reason,
    replies: [ctx.t.locationNotUnderstood(pool)],
  };
}

export const STEPS: Record<Step, StepHandler> = {
  MENU: {
    accepts: [],
    prompt: async (ctx) => [ctx.t.menu()],
  },

  CHOOSE_CAR: {
    accepts: ["car"],
    async prompt(ctx) {
      const p = ctx.state.pending;
      if (p.pickupDate && p.pickupTime && p.returnDate && p.returnTime) {
        const options = await availableOptions(
          ctx,
          toInstantIso(p.pickupDate, p.pickupTime),
          toInstantIso(p.returnDate, p.returnTime),
        );
        return [
          options.length
            ? ctx.t.carList(options, "available")
            : ctx.t.noAvailabilityForDates(),
        ];
      }
      return [ctx.t.carList(await fleetOptions(ctx), "fleet")];
    },
    async parse(input, ctx) {
      const p = ctx.state.pending;
      const haveDates =
        p.pickupDate && p.pickupTime && p.returnDate && p.returnTime;
      const options = haveDates
        ? await availableOptions(
            ctx,
            toInstantIso(p.pickupDate as string, p.pickupTime as string),
            toInstantIso(p.returnDate as string, p.returnTime as string),
          )
        : await fleetOptions(ctx);
      if (input.kind === "button") {
        const vehicle = await ctx.db.getVehicleById(input.id.value);
        return vehicle && vehicle.status === "ACTIVE"
          ? { ok: true, value: vehicle.id }
          : {
              ok: false,
              reason: "STALE",
              replies: [ctx.t.carNotUnderstood(options)],
            };
      }
      const r = parseCar(input.text, options, ctx.cfg);
      if (r.ok) {
        ctx.parsed.car = `${r.value.make} ${r.value.model}`;
        return { ok: true, value: r.value.id };
      }
      if (r.reason === "AMBIGUOUS") {
        const alts = (r.detail as { options: typeof options }).options;
        return {
          ok: false,
          reason: r.reason,
          noRetry: true,
          replies: [ctx.t.carAmbiguous(alts)],
        };
      }
      return {
        ok: false,
        reason: r.reason,
        replies: [ctx.t.carNotUnderstood(options)],
      };
    },
    async onValid(vehicleId: string, ctx) {
      const draftId = await ensureDraft(ctx);
      const p = ctx.state.pending;
      ctx.state.vehicleId = vehicleId;
      const vehicle = await ctx.db.getVehicleById(vehicleId);
      const intro = vehicle
        ? [
            ctx.t.carSelected({
              id: vehicleId,
              make: vehicle.make,
              model: vehicle.model,
              categoryName: "",
              dailyPriceRs: vehicle.dailyPriceRs,
              transmission: null,
              seats: null,
            }),
          ]
        : [];
      const text = intro.map((t) => textReply(t));

      if (p.pickupDate && p.pickupTime && p.returnDate && p.returnTime) {
        const done = await completeDates(ctx);
        return { ...done, replies: [...text, ...done.replies] };
      }
      try {
        await updateBookingDraft(ctx.db, draftId, { vehicleId }, ctx.now);
      } catch (error) {
        const out = await explainDomainError(ctx, error, {
          step: "CHOOSE_CAR",
          vehicleId,
        });
        if (out) return out;
        throw error;
      }
      return {
        replies: text,
        next: ctx.state.returnToSummary ? "SUMMARY" : "PICKUP_DATETIME",
      };
    },
  },

  PICKUP_DATETIME: {
    accepts: ["date", "time"],
    async prompt(ctx) {
      const p = ctx.state.pending;
      return [
        p.pickupDate && !p.pickupTime
          ? ctx.t.askTime(label(ctx, p.pickupDate))
          : ctx.t.askPickupDateTime(),
      ];
    },
    parse: (input, ctx) => readWhen(input, ctx, "pickup"),
    async onValid(_: string, ctx) {
      const p = ctx.state.pending;
      if (!p.pickupDate)
        return {
          replies: [ctx.t.askPickupDateTime()],
          next: "PICKUP_DATETIME",
          skipPrompt: true,
        };
      if (!p.pickupTime)
        return {
          replies: [ctx.t.askTime(label(ctx, p.pickupDate))],
          next: "PICKUP_DATETIME",
          skipPrompt: true,
        };
      if (isPast(ctx, p.pickupDate, p.pickupTime)) {
        p.pickupTime = undefined;
        return {
          replies: [ctx.t.datePast()],
          next: "PICKUP_DATETIME",
          skipPrompt: true,
        };
      }
      if (p.returnDate && p.returnTime) return completeDates(ctx);
      return { replies: [], next: "RETURN_DATETIME" };
    },
  },

  RETURN_DATETIME: {
    accepts: ["date", "time"],
    async prompt(ctx) {
      const p = ctx.state.pending;
      if (p.returnDate && !p.returnTime)
        return [ctx.t.askTime(label(ctx, p.returnDate))];
      return [
        ctx.t.askReturnDateTime(
          p.pickupDate ? label(ctx, p.pickupDate, p.pickupTime) : "",
        ),
      ];
    },
    parse: (input, ctx) => readWhen(input, ctx, "return"),
    async onValid(_: string, ctx) {
      const p = ctx.state.pending;
      if (!p.pickupDate || !p.pickupTime) {
        return { replies: [], next: "PICKUP_DATETIME" };
      }
      if (!p.returnDate)
        return {
          replies: [
            ctx.t.askReturnDateTime(label(ctx, p.pickupDate, p.pickupTime)),
          ],
          next: "RETURN_DATETIME",
          skipPrompt: true,
        };
      if (!p.returnTime)
        return {
          replies: [ctx.t.askTime(label(ctx, p.returnDate))],
          next: "RETURN_DATETIME",
          skipPrompt: true,
        };
      return completeDates(ctx);
    },
  },

  PICKUP_LOCATION: {
    accepts: ["loc"],
    prompt: async (ctx) => [
      ctx.t.askPickupLocation(await pickupLocations(ctx)),
    ],
    async parse(input, ctx) {
      return readLocation(input, ctx, await pickupLocations(ctx));
    },
    async onValid(location: LocationRow | "same", ctx) {
      if (location === "same") return { replies: [], next: "PICKUP_LOCATION" };
      const draftId = await ensureDraft(ctx);
      try {
        await updateBookingDraft(
          ctx.db,
          draftId,
          { pickupLocationId: location.id },
          ctx.now,
        );
      } catch (error) {
        const out = await explainDomainError(ctx, error, {
          step: "PICKUP_LOCATION",
          locationId: location.id,
        });
        if (out) return out;
        throw error;
      }
      return {
        replies: [],
        next: ctx.state.returnToSummary ? "SUMMARY" : "DROPOFF_LOCATION",
      };
    },
  },

  DROPOFF_LOCATION: {
    accepts: ["loc"],
    async prompt(ctx) {
      const draft = await loadDraft(ctx);
      const pickup = draft?.pickupLocationId
        ? ((await ctx.db.getLocationById(draft.pickupLocationId))?.name ?? "")
        : "";
      return [ctx.t.askDropoffLocation(await dropoffLocations(ctx), pickup)];
    },
    async parse(input, ctx) {
      return readLocation(input, ctx, await dropoffLocations(ctx));
    },
    async onValid(location: LocationRow | "same", ctx) {
      const draftId = await ensureDraft(ctx);
      const draft = await ctx.db.getBookingById(draftId);
      const dropoffLocationId =
        location === "same" ? draft?.pickupLocationId : location.id;
      if (!dropoffLocationId) return { replies: [], next: "PICKUP_LOCATION" };
      try {
        await updateBookingDraft(
          ctx.db,
          draftId,
          { dropoffLocationId },
          ctx.now,
        );
      } catch (error) {
        const out = await explainDomainError(ctx, error, {
          step: "DROPOFF_LOCATION",
          locationId: dropoffLocationId,
        });
        if (out) return out;
        throw error;
      }
      return {
        replies: [],
        next: ctx.state.returnToSummary ? "SUMMARY" : "FULL_NAME",
      };
    },
  },

  FULL_NAME: {
    accepts: ["name"],
    prompt: async (ctx) => [ctx.t.askName(ctx.customer.fullName)],
    async parse(input, ctx) {
      if (input.kind === "button") {
        return ctx.customer.fullName
          ? { ok: true, value: ctx.customer.fullName }
          : { ok: false, reason: "STALE", replies: [ctx.t.askName(null)] };
      }
      const r = parseFullName(input.text, ctx.cfg);
      if (r.ok) {
        ctx.parsed.name = r.value;
        return r;
      }
      return {
        ok: false,
        reason: r.reason,
        replies: [ctx.t.nameInvalid(r.reason as never)],
      };
    },
    async onValid(name: string, ctx) {
      if (name !== ctx.customer.fullName) {
        ctx.customer = await ctx.messaging.updateCustomerFullName(
          ctx.customer.id,
          name,
        );
      }
      return { replies: [], next: "SUMMARY" };
    },
  },

  SUMMARY: {
    accepts: ["confirm", "chg"],
    async prompt(ctx) {
      ctx.state.returnToSummary = undefined;
      try {
        const summary = await buildSummary(ctx);
        if (summary) return [ctx.t.summary(summary)];
      } catch (error) {
        const out = await explainDomainError(ctx, error, { step: "SUMMARY" });
        if (out) return out.replies;
        throw error;
      }
      return [ctx.t.genericError()];
    },
    async parse(input, ctx) {
      if (input.kind === "button") return { ok: true, value: input.id.raw };
      return {
        ok: false,
        reason: "TEXT_AT_SUMMARY",
        replies: await STEPS.SUMMARY.prompt(ctx),
      };
    },
    async onValid(action: string, ctx) {
      switch (action) {
        case IDS.confirm.yes:
          return confirmDraft(ctx);
        case IDS.confirm.change:
          return {
            replies: [ctx.t.changeMenu()],
            next: "SUMMARY",
            skipPrompt: true,
          };
        case IDS.confirm.cancel: {
          await cancelOwnDraft(ctx);
          resetFlowState(ctx);
          return {
            replies: [ctx.t.draftCancelled()],
            next: "MENU",
            skipPrompt: true,
          };
        }
        case IDS.change.car:
          ctx.state.returnToSummary = true;
          return { replies: [], next: "CHOOSE_CAR" };
        case IDS.change.dates:
          ctx.state.returnToSummary = true;
          ctx.state.pending = {};
          return { replies: [], next: "PICKUP_DATETIME" };
        case IDS.change.pickup:
          ctx.state.returnToSummary = true;
          return { replies: [], next: "PICKUP_LOCATION" };
        case IDS.change.dropoff:
          ctx.state.returnToSummary = true;
          return { replies: [], next: "DROPOFF_LOCATION" };
        case IDS.change.name:
          ctx.state.returnToSummary = true;
          return { replies: [], next: "FULL_NAME" };
        default:
          return { replies: [], next: "SUMMARY" };
      }
    },
  },

  AWAITING_DOCUMENTS: {
    accepts: [],
    async prompt(ctx) {
      const booking = await ctx.getActiveBooking();
      if (!booking) return [ctx.t.menu()];
      return [
        ctx.t.awaitingDocuments(
          await buildStatusCard(ctx, booking),
          booking.uploadToken
            ? `${ctx.deps.appUrl()}/documents/${booking.uploadToken}`
            : null,
        ),
      ];
    },
  },

  EXISTING_BOOKING_MENU: {
    accepts: ["req", "bk"],
    async prompt(ctx) {
      const booking = await ctx.getActiveBooking();
      if (!booking) return [ctx.t.noActiveBooking()];
      return [ctx.t.statusCard(await buildStatusCard(ctx, booking))];
    },
  },

  CHANGE_REQUEST_DETAILS: {
    accepts: ["confirm"],
    prompt: changePrompt,
    parse: handleChangeParse,
    onValid: applyChange,
  },

  DONE: {
    accepts: [],
    prompt: async (ctx) => [ctx.t.menu()],
  },
};

async function confirmDraft(ctx: TurnCtx): Promise<Outcome> {
  const draft = await loadDraft(ctx);
  if (!draft)
    return { replies: [ctx.t.genericError()], next: "MENU", skipPrompt: true };
  try {
    const booking = await confirmBooking(ctx.db, draft.id, ctx.now);
    ctx.bookingConfirmed = true;
    ctx.confirmedBookingId = booking.id;
    ctx.parsed.bookingNumber = booking.bookingNumber;
    const url = `${ctx.deps.appUrl()}/documents/${booking.uploadToken}`;
    resetFlowState(ctx);
    ctx.state.draftBookingId = undefined;
    return {
      replies: [
        ctx.t.confirmed(booking.bookingNumber, url, UPLOAD_TOKEN_TTL_HOURS),
      ],
      next: "AWAITING_DOCUMENTS",
      skipPrompt: true,
    };
  } catch (error) {
    const out = await explainDomainError(ctx, error, {
      step: "SUMMARY",
      pickupAt: draft.pickupAt ?? undefined,
      returnAt: draft.returnAt ?? undefined,
      vehicleId: draft.vehicleId ?? undefined,
    });
    if (out) {
      // Dates stay on the draft; re-picking a car re-validates them.
      if (out.next === "CHOOSE_CAR" && draft.pickupAt && draft.returnAt) {
        const a = fromInstant(draft.pickupAt);
        const b = fromInstant(draft.returnAt);
        ctx.state.pending = {
          pickupDate: a.date,
          pickupTime: a.time,
          returnDate: b.date,
          returnTime: b.time,
        };
      }
      return out;
    }
    throw error;
  }
}

/** Where BACK goes from each step (null = menu). */
export function previousStep(ctx: TurnCtx): Step {
  const hasCar = Boolean(ctx.state.vehicleId);
  switch (ctx.state.step) {
    case "CHOOSE_CAR":
      return "MENU";
    case "PICKUP_DATETIME":
      return hasCar ? "CHOOSE_CAR" : "MENU";
    case "RETURN_DATETIME":
      return "PICKUP_DATETIME";
    case "PICKUP_LOCATION":
      return "RETURN_DATETIME";
    case "DROPOFF_LOCATION":
      return "PICKUP_LOCATION";
    case "FULL_NAME":
      return "DROPOFF_LOCATION";
    case "SUMMARY":
      return "FULL_NAME";
    default:
      return "MENU";
  }
}

/** Moves to `step` and returns its prompt. */
export async function enterStep(
  ctx: TurnCtx,
  step: Step,
): Promise<WhatsAppReply[]> {
  ctx.state.step = step;
  ctx.state.retries = 0;
  if (step === "MENU") resetFlowState(ctx);
  return STEPS[step].prompt(ctx);
}
