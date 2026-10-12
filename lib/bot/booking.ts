import { calculatePrice } from "@/lib/domain/calculatePrice";
import { createBookingDraft } from "@/lib/domain/createBookingDraft";
import { DomainError } from "@/lib/domain/errors";
import { getAvailableVehicles } from "@/lib/domain/getAvailableVehicles";
import { getFleet } from "@/lib/domain/getFleet";
import type { BookingRow } from "@/lib/domain/ports";
import type { TurnCtx } from "./context";
import { toCarOptions, type CarOption } from "./parsers/car";
import type { StatusCardData, SummaryData } from "./templates";

const DRAFT_STATUSES = new Set(["ENQUIRY", "CAR_SELECTED", "DATES_SELECTED"]);

export const isDraftStatus = (status: string) => DRAFT_STATUSES.has(status);

/** The customer's own draft if still editable, otherwise a fresh one (the domain layer creates it). */
export async function ensureDraft(ctx: TurnCtx): Promise<string> {
  const id = ctx.state.draftBookingId;
  if (id) {
    const booking = await ctx.db.getBookingById(id);
    if (
      booking &&
      booking.customerId === ctx.customer.id &&
      isDraftStatus(booking.status)
    ) {
      return booking.id;
    }
  }
  const draft = await createBookingDraft(ctx.db, ctx.customer.id);
  ctx.state.draftBookingId = draft.id;
  return draft.id;
}

export async function loadDraft(ctx: TurnCtx): Promise<BookingRow | null> {
  const id = ctx.state.draftBookingId;
  if (!id) return null;
  const booking = await ctx.db.getBookingById(id);
  return booking && booking.customerId === ctx.customer.id ? booking : null;
}

/** The whole fleet, one entry per model (display data — may be a few seconds stale). */
export async function fleetOptions(ctx: TurnCtx): Promise<CarOption[]> {
  return toCarOptions(await getFleet(ctx.displayDb));
}

/**
 * Cars that are actually free for the dates — availability always comes from
 * the database (getAvailableVehicles), enriched with fleet display data. Each
 * option's id is a vehicle that IS free, so choosing it can't pick a booked car.
 */
export async function availableOptions(
  ctx: TurnCtx,
  pickupAtIso: string,
  returnAtIso: string,
): Promise<CarOption[]> {
  const [fleet, free] = await Promise.all([
    getFleet(ctx.displayDb),
    getAvailableVehicles(ctx.db, {
      pickupAt: pickupAtIso,
      returnAt: returnAtIso,
    }),
  ]);
  const meta = new Map(fleet.map((g) => [`${g.make}::${g.model}`, g]));
  return toCarOptions(
    free.map((g) => {
      const m = meta.get(`${g.make}::${g.model}`);
      return {
        vehicleIds: g.vehicleIds,
        make: g.make,
        model: g.model,
        dailyPriceRs: g.dailyPriceRs,
        categoryName: m?.categoryName,
        transmission: m?.transmission,
        seats: m?.seats,
        available: g.available,
      };
    }),
  );
}

export async function carNameOf(
  ctx: TurnCtx,
  vehicleId: string | null,
): Promise<string | null> {
  if (!vehicleId) return null;
  const v = await ctx.db.getVehicleById(vehicleId);
  return v ? `${v.make} ${v.model}` : null;
}

export async function locationName(
  ctx: TurnCtx,
  id: string | null,
): Promise<string | null> {
  if (!id) return null;
  return (await ctx.db.getLocationById(id))?.name ?? null;
}

export async function buildStatusCard(
  ctx: TurnCtx,
  booking: BookingRow,
): Promise<StatusCardData> {
  const [carName, pickupLocation, dropoffLocation] = await Promise.all([
    carNameOf(ctx, booking.vehicleId),
    locationName(ctx, booking.pickupLocationId),
    locationName(ctx, booking.dropoffLocationId),
  ]);
  return {
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    carName,
    pickupAt: booking.pickupAt,
    returnAt: booking.returnAt,
    pickupLocation,
    dropoffLocation,
    totalRs: booking.totalRs,
    paymentStatus: booking.paymentStatus,
    documentStatus: booking.documentStatus,
  };
}

/** The priced summary for the draft; prices come only from calculatePrice (the database). */
export async function buildSummary(ctx: TurnCtx): Promise<SummaryData | null> {
  const booking = await loadDraft(ctx);
  if (
    !booking ||
    !booking.vehicleId ||
    !booking.pickupAt ||
    !booking.returnAt ||
    !booking.pickupLocationId
  ) {
    return null;
  }
  const dropoffId = booking.dropoffLocationId ?? booking.pickupLocationId;
  const [price, carName, pickup, dropoff] = await Promise.all([
    calculatePrice(ctx.db, {
      vehicleId: booking.vehicleId,
      pickupAt: booking.pickupAt,
      returnAt: booking.returnAt,
      pickupLocationId: booking.pickupLocationId,
      dropoffLocationId: dropoffId,
      extrasRs: booking.extrasRs,
    }),
    carNameOf(ctx, booking.vehicleId),
    locationName(ctx, booking.pickupLocationId),
    locationName(ctx, dropoffId),
  ]);
  return {
    carName: carName ?? "",
    pickupAt: booking.pickupAt,
    returnAt: booking.returnAt,
    pickupLocation: pickup ?? "",
    dropoffLocation: dropoff ?? pickup ?? "",
    rentalDays: price.rentalDays,
    lineItems: price.lineItems,
    totalRs: price.totalRs,
    customerName: ctx.customer.fullName ?? "",
  };
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
