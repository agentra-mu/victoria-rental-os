import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "./errors";
import { type BookingStatus } from "./bookingStatus";
import {
  additionalDays,
  quoteAdditionalRs,
  type ChangeRequestType,
} from "./changeRequests";
import { assertTransition } from "./bookingStatus";

export interface ChangeDetails {
  newReturnAt?: string;
  newPickupAt?: string;
  newDropoffLocationId?: string;
  note?: string;
}

interface BookingForChange {
  id: string;
  booking_number: number;
  customer_id: string;
  vehicle_id: string | null;
  pickup_at: string | null;
  return_at: string | null;
  rental_days: number | null;
  daily_price_rs: number | null;
  total_rs: number | null;
  dropoff_location_id: string | null;
  status: BookingStatus;
}

/** Is `vehicleId` free in the window? Bookings (non-cancelled) and maintenance both block. */
export async function vehicleIsFree(
  client: SupabaseClient,
  vehicleId: string,
  pickupAt: Date,
  returnAt: Date,
  excludeBookingId?: string,
): Promise<boolean> {
  let q = client
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("vehicle_id", vehicleId)
    .neq("status", "CANCELLED")
    .neq("status", "ENQUIRY")
    .lt("pickup_at", returnAt.toISOString())
    .gt("return_at", pickupAt.toISOString());
  if (excludeBookingId) q = q.neq("id", excludeBookingId);
  const { count, error } = await q;
  if (error) throw error;
  if ((count ?? 0) > 0) return false;

  const { count: m, error: mErr } = await client
    .from("vehicle_maintenance")
    .select("id", { count: "exact", head: true })
    .eq("vehicle_id", vehicleId)
    .lt("start_at", returnAt.toISOString())
    .gt("end_at", pickupAt.toISOString());
  if (mErr) throw mErr;
  return (m ?? 0) === 0;
}

async function loadBooking(
  client: SupabaseClient,
  id: string,
): Promise<BookingForChange> {
  const { data, error } = await client
    .from("bookings")
    .select(
      "id, booking_number, customer_id, vehicle_id, pickup_at, return_at, rental_days, daily_price_rs, total_rs, dropoff_location_id, status",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new DomainError("BOOKING_NOT_FOUND", `Booking ${id} not found`);
  return data as BookingForChange;
}

/** Same-model vehicles free in the window (for swap suggestions). */
async function findSwapVehicle(
  client: SupabaseClient,
  vehicleId: string,
  pickupAt: Date,
  returnAt: Date,
): Promise<string | null> {
  const { data: v } = await client
    .from("vehicles")
    .select("make, model")
    .eq("id", vehicleId)
    .maybeSingle();
  if (!v) return null;
  const { data: sameModel } = await client
    .from("vehicles")
    .select("id, vehicle_code")
    .eq("make", v.make)
    .eq("model", v.model)
    .eq("status", "ACTIVE")
    .neq("id", vehicleId);
  for (const other of sameModel ?? []) {
    if (await vehicleIsFree(client, other.id, pickupAt, returnAt)) {
      return other.vehicle_code as string;
    }
  }
  return null;
}

export interface ChangeRequestResult {
  requestId: string;
  quotedAdditionalRs: number;
  availabilityOk: boolean;
  conflictNote: string | null;
}

/**
 * Creates a PENDING request with an availability check and a quote, and
 * notifies the owner. Never applies the change — only an authenticated owner
 * approval does (applyChangeRequest).
 */
export async function createChangeRequest(
  client: SupabaseClient,
  bookingId: string,
  type: ChangeRequestType,
  details: ChangeDetails,
): Promise<ChangeRequestResult> {
  const booking = await loadBooking(client, bookingId);
  const currentReturn = booking.return_at ? new Date(booking.return_at) : null;
  const currentPickup = booking.pickup_at ? new Date(booking.pickup_at) : null;
  const newReturn = details.newReturnAt
    ? new Date(details.newReturnAt)
    : undefined;
  const newPickup = details.newPickupAt
    ? new Date(details.newPickupAt)
    : undefined;

  let availabilityOk = true;
  let conflictNote: string | null = null;
  const windowStart = newPickup ?? currentPickup;
  const windowEnd = newReturn ?? currentReturn;
  if (
    booking.vehicle_id &&
    windowStart &&
    windowEnd &&
    (newReturn || newPickup)
  ) {
    availabilityOk = await vehicleIsFree(
      client,
      booking.vehicle_id,
      windowStart,
      windowEnd,
      booking.id,
    );
    if (!availabilityOk) {
      const swap = await findSwapVehicle(
        client,
        booking.vehicle_id,
        windowStart,
        windowEnd,
      );
      conflictNote = swap
        ? `Assigned vehicle is not free; ${swap} (same model) is — a swap is possible`
        : "Assigned vehicle is not free and no same-model vehicle is available";
    }
  }

  const quotedAdditionalRs =
    currentReturn && booking.daily_price_rs !== null
      ? quoteAdditionalRs({
          type,
          dailyPriceRs: booking.daily_price_rs,
          currentReturnAt: currentReturn,
          newReturnAt: newReturn,
        })
      : 0;

  const { data, error } = await client
    .from("booking_change_requests")
    .insert({
      booking_id: booking.id,
      type,
      requested_values: details,
      current_values: {
        pickupAt: booking.pickup_at,
        returnAt: booking.return_at,
        dropoffLocationId: booking.dropoff_location_id,
      },
      quoted_additional_rs: quotedAdditionalRs,
      availability_ok: availabilityOk,
      conflict_note: conflictNote,
      status: "PENDING",
    })
    .select("id")
    .single();
  if (error) throw error;

  await client.from("owner_notifications").insert({
    booking_id: booking.id,
    type: "CHANGE_REQUEST",
    title: `${type.replace(/_/g, " ").toLowerCase()} requested — booking #${booking.booking_number}`,
    body: details.note ?? null,
  });

  return {
    requestId: data.id as string,
    quotedAdditionalRs,
    availabilityOk,
    conflictNote,
  };
}

export type ApplyOutcome = { applied: true; customerMessage: string };

/**
 * Approve: re-validates availability *now* (another booking may have taken
 * the slot since the request was made), applies the change, updates the total,
 * resolves the notification. Throws VEHICLE_UNAVAILABLE on a lost race.
 */
export async function applyChangeRequest(
  client: SupabaseClient,
  requestId: string,
  staffUserId: string,
): Promise<ApplyOutcome> {
  const { data: req, error } = await client
    .from("booking_change_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!req || req.status !== "PENDING") {
    throw new DomainError("REQUEST_NOT_PENDING", "Request is not pending");
  }
  const booking = await loadBooking(client, req.booking_id);
  const d = req.requested_values as ChangeDetails;
  const patch: Record<string, unknown> = {};
  let message = "Your request has been approved.";

  const newReturn = d.newReturnAt ? new Date(d.newReturnAt) : null;
  const newPickup = d.newPickupAt ? new Date(d.newPickupAt) : null;
  const pickup =
    newPickup ?? (booking.pickup_at ? new Date(booking.pickup_at) : null);
  const ret =
    newReturn ?? (booking.return_at ? new Date(booking.return_at) : null);

  if ((newReturn || newPickup) && booking.vehicle_id && pickup && ret) {
    const free = await vehicleIsFree(
      client,
      booking.vehicle_id,
      pickup,
      ret,
      booking.id,
    );
    if (!free) {
      throw new DomainError(
        "VEHICLE_UNAVAILABLE",
        "The vehicle was booked by someone else since this request was made",
      );
    }
  }

  if (req.type === "CANCELLATION") {
    assertTransition(booking.status, "CANCELLED");
    patch.status = "CANCELLED";
    message = `Your booking #${booking.booking_number} has been cancelled.`;
  } else {
    if (newPickup) patch.pickup_at = newPickup.toISOString();
    if (newReturn) {
      patch.return_at = newReturn.toISOString();
      if (
        (req.type === "EXTENSION" || req.type === "RETURN_TIME_CHANGE") &&
        booking.return_at
      ) {
        patch.rental_days =
          (booking.rental_days ?? 0) +
          additionalDays(new Date(booking.return_at), newReturn);
      }
    }
    if (d.newDropoffLocationId)
      patch.dropoff_location_id = d.newDropoffLocationId;
    if (req.quoted_additional_rs > 0) {
      patch.total_rs = (booking.total_rs ?? 0) + req.quoted_additional_rs;
      message += ` Additional amount: Rs ${req.quoted_additional_rs} (new total Rs ${patch.total_rs}, payable in cash).`;
    }
  }

  await client.from("bookings").update(patch).eq("id", booking.id);
  await client
    .from("booking_change_requests")
    .update({
      status: "APPROVED",
      decided_by: staffUserId,
      decided_at: new Date().toISOString(),
      customer_notified_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  await client
    .from("owner_notifications")
    .update({ status: "RESOLVED", resolved_at: new Date().toISOString() })
    .eq("booking_id", booking.id)
    .eq("type", "CHANGE_REQUEST")
    .eq("status", "OPEN");
  await client.from("booking_events").insert({
    booking_id: booking.id,
    event_type: `CHANGE_${req.type}_APPROVED`,
    actor: "owner",
    actor_user_id: staffUserId,
    payload: { requestId, patch },
  });
  return { applied: true, customerMessage: message };
}

export async function declineChangeRequest(
  client: SupabaseClient,
  requestId: string,
  staffUserId: string,
  reason?: string,
): Promise<{ customerId: string; customerMessage: string }> {
  const { data: req } = await client
    .from("booking_change_requests")
    .select("id, booking_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!req || req.status !== "PENDING") {
    throw new DomainError("REQUEST_NOT_PENDING", "Request is not pending");
  }
  const booking = await loadBooking(client, req.booking_id);
  await client
    .from("booking_change_requests")
    .update({
      status: "DECLINED",
      decline_reason: reason ?? null,
      decided_by: staffUserId,
      decided_at: new Date().toISOString(),
      customer_notified_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  await client
    .from("owner_notifications")
    .update({ status: "RESOLVED", resolved_at: new Date().toISOString() })
    .eq("booking_id", booking.id)
    .eq("type", "CHANGE_REQUEST")
    .eq("status", "OPEN");
  return {
    customerId: booking.customer_id,
    customerMessage: `Sorry — we couldn't approve your request for booking #${booking.booking_number}.${reason ? ` ${reason}` : ""} Reply here if you'd like to discuss.`,
  };
}

/** Expire PENDING requests whose requested time has already passed; notify the owner. */
export async function expireStaleRequests(
  client: SupabaseClient,
  now: Date,
): Promise<number> {
  const { data } = await client
    .from("booking_change_requests")
    .select("id, booking_id, requested_values")
    .eq("status", "PENDING");
  let expired = 0;
  for (const r of data ?? []) {
    const v = r.requested_values as ChangeDetails;
    const when = v.newPickupAt ?? v.newReturnAt;
    if (when && Date.parse(when) < now.getTime()) {
      await client
        .from("booking_change_requests")
        .update({ status: "EXPIRED" })
        .eq("id", r.id);
      await client.from("owner_notifications").insert({
        booking_id: r.booking_id,
        type: "ALERT",
        title: "A change request expired without a decision",
      });
      expired += 1;
    }
  }
  return expired;
}
