import type { BookingRow, DomainDb } from "@/lib/domain/ports";
import {
  resolveActiveBooking,
  type ActiveBookingResolution,
} from "@/lib/domain/customerContext";
import type { TurnLlm } from "@/lib/llm/guard";
import type {
  ConversationRow,
  CustomerRow,
  MessagingDb,
} from "@/lib/whatsapp/ports";
import { cachedCatalog, cachedDomainDb } from "./cache";
import { loadBotConfig, type BotConfig } from "./config";
import type { BotCatalog, BotDeps } from "./ports";
import { getTemplates, type Templates } from "./templates";
import type { BotState, InboundInput, Lang } from "./types";

export interface Timing {
  dbMs: number;
}

/** Wraps every async method so the sum of DB time lands in the per-turn log line. */
function timed<T extends object>(target: T, timing: Timing): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const started = Date.now();
        const result = (value as (...a: unknown[]) => unknown).apply(obj, args);
        if (result instanceof Promise) {
          return result.finally(() => {
            timing.dbMs += Date.now() - started;
          });
        }
        return result;
      };
    },
  });
}

/** Everything one turn needs; created once per inbound message. */
export interface TurnCtx {
  deps: BotDeps;
  cfg: BotConfig;
  /** Real database (writes, availability) — DB time is tracked. */
  db: DomainDb;
  /** Display-only cache over the same DB (fleet / locations lists). */
  displayDb: DomainDb;
  messaging: MessagingDb;
  catalog: BotCatalog;
  customer: CustomerRow;
  conversation: ConversationRow;
  state: BotState;
  lang: Lang;
  t: Templates;
  now: Date;
  input: InboundInput;
  llm: TurnLlm | null;
  timing: Timing;
  /** Parsed values and notes for the simulator / turn log. */
  parsed: Record<string, unknown>;
  /** Set when this turn confirmed a booking (analytics). */
  bookingConfirmed: boolean;
  /** The booking this turn confirmed, for the turn log (the draft id is cleared on confirm). */
  confirmedBookingId?: string;
  /** Lazily resolved, memoised for the turn. */
  getResolution(): Promise<ActiveBookingResolution>;
  /** The customer's current non-draft booking, if exactly one. */
  getActiveBooking(): Promise<BookingRow | null>;
  setLang(lang: Lang): void;
}

export function createCtx(args: {
  deps: BotDeps;
  customer: CustomerRow;
  conversation: ConversationRow;
  state: BotState;
  lang: Lang;
  input: InboundInput;
  llm: TurnLlm | null;
}): TurnCtx {
  const { deps } = args;
  const timing: Timing = { dbMs: 0 };
  const db = timed(deps.domainDb, timing);
  const displayDb = timed(cachedDomainDb(deps.domainDb), timing);
  const messaging = timed(deps.messaging, timing);
  const catalog = timed(cachedCatalog(deps.catalog), timing);
  const now = deps.now?.() ?? new Date();

  let resolution: Promise<ActiveBookingResolution> | null = null;
  const ctx: TurnCtx = {
    deps,
    cfg: deps.config ?? loadBotConfig(),
    db,
    displayDb,
    messaging,
    catalog,
    customer: args.customer,
    conversation: args.conversation,
    state: args.state,
    lang: args.lang,
    t: getTemplates(args.lang),
    now,
    input: args.input,
    llm: args.llm,
    timing,
    parsed: {},
    bookingConfirmed: false,
    getResolution() {
      resolution ??= resolveActiveBooking(db, args.customer.id, now);
      return resolution;
    },
    async getActiveBooking() {
      const r = await ctx.getResolution();
      const picked = args.state.selectedBookingId;
      if (picked) {
        const chosen = r.candidates.find((b) => b.id === picked);
        if (chosen && r.reason !== "DRAFT") return chosen;
      }
      if (!r.booking || r.reason === "DRAFT") return null;
      return r.booking;
    },
    setLang(lang) {
      ctx.lang = lang;
      ctx.t = getTemplates(lang);
      ctx.state.lang = lang;
    },
  };
  return ctx;
}
