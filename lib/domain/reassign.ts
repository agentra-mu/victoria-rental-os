import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "./errors";
import { hasExpiredPapers } from "./assignVehicle";
import { vehicleIsFree } from "./changeRequestsDb";

/** Moves a booking to another physical vehicle, validating status, papers and conflicts. */
export async function reassignBooking(
  client: SupabaseClient,
  bookingId: string,
  vehicleId: string,
  staffUserId: string,
): Promise<void> {
  const { data: booking } = await client
    .from("bookings")
    .select("id, pickup_at, return_at, vehicle_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking?.pickup_at || !booking.return_at) {
    throw new DomainError("INCOMPLETE_BOOKING", "Booking has no dates yet");
  }
  const { data: vehicle } = await client
    .from("vehicles")
    .select(
      "id, status, insurance_expiry, inspection_expiry, mileage, current_location_id, home_location_id",
    )
    .eq("id", vehicleId)
    .maybeSingle();
  if (!vehicle) throw new DomainError("VEHICLE_NOT_FOUND", "Vehicle not found");
  if (vehicle.status !== "ACTIVE") {
    throw new DomainError("VEHICLE_NOT_ASSIGNABLE", "Vehicle is not active");
  }
  const pickup = new Date(booking.pickup_at);
  if (
    hasExpiredPapers(
      {
        id: vehicle.id,
        currentLocationId: vehicle.current_location_id,
        homeLocationId: vehicle.home_location_id,
        lastUsedAt: null,
        mileage: vehicle.mileage,
        insuranceExpiry: vehicle.insurance_expiry,
        inspectionExpiry: vehicle.inspection_expiry,
      },
      pickup,
    )
  ) {
    throw new DomainError(
      "VEHICLE_NOT_ASSIGNABLE",
      "Vehicle's insurance or inspection has expired",
    );
  }
  const free = await vehicleIsFree(
    client,
    vehicleId,
    pickup,
    new Date(booking.return_at),
    bookingId,
  );
  if (!free) {
    throw new DomainError(
      "VEHICLE_UNAVAILABLE",
      "Vehicle is not free for these dates",
    );
  }
  const { error } = await client
    .from("bookings")
    .update({ vehicle_id: vehicleId })
    .eq("id", bookingId);
  if (error) throw error;
  // The bookings trigger writes the VEHICLE_REASSIGNED event.
  void staffUserId;
}
