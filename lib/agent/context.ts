import { TIMEZONE } from "@/lib/domain/config";
import { listAllKnowledgeBase } from "@/lib/domain/knowledgeBase";
import type {
  BookingRow,
  DomainDb,
  KnowledgeBaseEntryRow,
} from "@/lib/domain/ports";
import { HISTORY_MESSAGE_LIMIT } from "./config";
import type { AgentDeps } from "./ports";
import type {
  ConversationRow,
  CustomerRow,
  MessageRow,
} from "@/lib/whatsapp/ports";

export interface ActiveBookingContext {
  booking: BookingRow;
  vehicleMake: string | null;
  vehicleModel: string | null;
  pickupLocationName: string | null;
  dropoffLocationName: string | null;
}

export interface AgentContext {
  customer: CustomerRow;
  conversation: ConversationRow;
  activeBooking: ActiveBookingContext | null;
  recentMessages: MessageRow[];
  knowledgeBase: KnowledgeBaseEntryRow[];
  /** Human-readable "now" in Indian/Mauritius, for the system prompt. */
  todayText: string;
  now: Date;
  /** True when `recentMessages` holds only the message that triggered this turn — used for the main-menu greeting. */
  isFirstContact: boolean;
}

/** Resolves a booking's vehicle/location ids to display names — never invented, always from the domain layer. */
export async function describeActiveBooking(
  db: DomainDb,
  booking: BookingRow,
): Promise<ActiveBookingContext> {
  const [vehicle, pickupLocation, dropoffLocation] = await Promise.all([
    booking.vehicleId ? db.getVehicleById(booking.vehicleId) : null,
    booking.pickupLocationId
      ? db.getLocationById(booking.pickupLocationId)
      : null,
    booking.dropoffLocationId
      ? db.getLocationById(booking.dropoffLocationId)
      : null,
  ]);
  return {
    booking,
    vehicleMake: vehicle?.make ?? null,
    vehicleModel: vehicle?.model ?? null,
    pickupLocationName: pickupLocation?.name ?? null,
    dropoffLocationName: dropoffLocation?.name ?? null,
  };
}

function formatTodayText(now: Date): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return `${formatted} (${TIMEZONE}, UTC+4)`;
}

/**
 * Everything a single agent turn needs, loaded once up front. Kept separate
 * from the tool-call layer (/lib/agent/tools.ts) which re-reads live data
 * mid-turn — this snapshot is only for building the system prompt.
 */
export async function loadAgentContext(
  deps: Pick<AgentDeps, "domainDb" | "messaging" | "now">,
  conversationId: string,
  customer: CustomerRow,
  conversation: ConversationRow,
): Promise<AgentContext> {
  const now = deps.now?.() ?? new Date();

  const [activeBookingRow, recentMessages, knowledgeBase] = await Promise.all([
    deps.domainDb.getActiveBookingForCustomer(customer.id),
    deps.messaging.listRecentMessages(conversationId, HISTORY_MESSAGE_LIMIT),
    listAllKnowledgeBase(deps.domainDb),
  ]);

  const activeBooking = activeBookingRow
    ? await describeActiveBooking(deps.domainDb, activeBookingRow)
    : null;

  return {
    customer,
    conversation,
    activeBooking,
    recentMessages,
    knowledgeBase,
    todayText: formatTodayText(now),
    now,
    isFirstContact: recentMessages.length <= 1,
  };
}
