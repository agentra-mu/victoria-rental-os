import type { WhatsAppReply } from "@/lib/whatsapp/replies";

export type Lang = "en" | "fr";
export const LANGS: readonly Lang[] = ["en", "fr"];

export const STEPS = [
  "MENU",
  "CHOOSE_CAR",
  "PICKUP_DATETIME",
  "RETURN_DATETIME",
  "PICKUP_LOCATION",
  "DROPOFF_LOCATION",
  "FULL_NAME",
  "SUMMARY",
  "AWAITING_DOCUMENTS",
  "EXISTING_BOOKING_MENU",
  "CHANGE_REQUEST_DETAILS",
  "DONE",
] as const;
export type Step = (typeof STEPS)[number];

/** Which layer produced the reply — stored on messages.handled_by and bot_turns.layer. */
export type HandledBy =
  | "button"
  | "command"
  | "state_machine"
  | "faq"
  | "existing_booking"
  | "llm_fallback"
  | "human";

export type ChangeKind =
  "RETURN_DELAY" | "EXTENSION" | "PICKUP_TIME_CHANGE" | "CANCELLATION";

/** Dates/times collected so far, local Indian/Mauritius wall-clock ("YYYY-MM-DD" / "HH:mm"). */
export interface PendingWhen {
  pickupDate?: string;
  pickupTime?: string;
  returnDate?: string;
  returnTime?: string;
}

export interface PendingChange {
  type: ChangeKind;
  bookingId: string;
  stage: "collect" | "confirm";
  newReturnAt?: string;
  newPickupAt?: string;
  note?: string;
}

/**
 * Conversation working memory, persisted in conversations.state. Never a
 * source of truth for booking data — the bookings table is.
 */
export interface BotState {
  step: Step;
  /** Consecutive failed parses at the current step. */
  retries: number;
  draftBookingId?: string;
  /** Vehicle chosen from the fleet list (any vehicle of the group; swapped for a free sibling at booking time). */
  vehicleId?: string;
  pending: PendingWhen;
  /** Set when "Change" was picked at the summary: after the edited step, jump straight back to SUMMARY. */
  returnToSummary?: boolean;
  change?: PendingChange;
  /** Booking picked from the "which booking?" list. */
  selectedBookingId?: string;
  /** Consecutive turns nobody could understand (drives the NEEDS_HUMAN escalation). */
  unknownStreak: number;
  lang?: Lang;
  /** Second-chance clarification waiting for a button tap. */
  awaiting?: { kind: "date" | "time"; field: "pickup" | "return" };
  /** Last FAQ answer shown, so "not helpful" can offer a human. */
  lastFaqEntryId?: string;
}

export function freshState(): BotState {
  return { step: "MENU", retries: 0, pending: {}, unknownStreak: 0 };
}

/** Coerces whatever is in conversations.state (including the old agent's shape) into a BotState. */
export function readState(
  raw: Record<string, unknown> | null | undefined,
): BotState {
  const base = freshState();
  if (!raw) return base;
  const step = STEPS.includes(raw.step as Step) ? (raw.step as Step) : "MENU";
  return {
    ...base,
    step,
    retries: typeof raw.retries === "number" ? raw.retries : 0,
    draftBookingId:
      typeof raw.draftBookingId === "string" ? raw.draftBookingId : undefined,
    vehicleId: typeof raw.vehicleId === "string" ? raw.vehicleId : undefined,
    pending:
      raw.pending && typeof raw.pending === "object"
        ? (raw.pending as PendingWhen)
        : {},
    returnToSummary: raw.returnToSummary === true ? true : undefined,
    change: raw.change as PendingChange | undefined,
    selectedBookingId:
      typeof raw.selectedBookingId === "string"
        ? raw.selectedBookingId
        : undefined,
    unknownStreak:
      typeof raw.unknownStreak === "number" ? raw.unknownStreak : 0,
    lang: raw.lang === "fr" || raw.lang === "en" ? raw.lang : undefined,
    awaiting: raw.awaiting as BotState["awaiting"],
    lastFaqEntryId:
      typeof raw.lastFaqEntryId === "string" ? raw.lastFaqEntryId : undefined,
  };
}

/** What the customer sent, normalised from the n8n payload. */
export type InboundInput =
  | { kind: "button"; id: string; title?: string }
  | { kind: "text"; text: string }
  | { kind: "media"; mediaType: "image" | "document" | "location" };

export interface TurnTrace {
  layer: HandledBy;
  /** Short machine description of what matched, e.g. "intent:view_cars", "step:RETURN_DATETIME". */
  matched?: string;
  /** Parsed values (dates, car, location, name…) for the simulator and analytics. */
  parsed?: Record<string, unknown>;
  /** The message nobody understood (feeds the "top unrecognised phrases" report). */
  unrecognised?: boolean;
  llmCalls: number;
  step: Step;
  nextStep: Step;
  totalMs: number;
  dbMs: number;
  llmMs: number;
}

export interface TurnResult {
  replies: WhatsAppReply[];
  handledBy: HandledBy;
  trace: TurnTrace;
  /** 'llm' when the reply text came from the optional model (grounded KB answer); stored on messages.generated_by. */
  generatedBy?: "llm";
  /** Set when the turn handed the chat to a person; inbound.ts forwards it to n8n. */
  notifyOwner?: { title: string; body?: string };
}
