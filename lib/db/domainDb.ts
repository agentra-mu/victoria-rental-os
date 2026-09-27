import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db/types";
import type {
  BookingEventInput,
  BookingPatch,
  BookingRow,
  DomainDb,
  KnowledgeBaseEntryRow,
  LocationRow,
  OverlapFilter,
  VehicleCategoryRow,
  VehicleRow,
} from "@/lib/domain/ports";

type Client = SupabaseClient<Database>;
type VehicleTableRow = Database["public"]["Tables"]["vehicles"]["Row"];
type VehicleCategoryTableRow =
  Database["public"]["Tables"]["vehicle_categories"]["Row"];
type LocationTableRow = Database["public"]["Tables"]["locations"]["Row"];
type BookingTableRow = Database["public"]["Tables"]["bookings"]["Row"];
type BookingTableUpdate = Database["public"]["Tables"]["bookings"]["Update"];
type KnowledgeBaseTableRow =
  Database["public"]["Tables"]["knowledge_base"]["Row"];

function mapVehicle(row: VehicleTableRow): VehicleRow {
  return {
    id: row.id,
    vehicleCode: row.vehicle_code,
    make: row.make,
    model: row.model,
    categoryId: row.category_id,
    dailyPriceRs: row.daily_price_rs,
    homeLocationId: row.home_location_id,
    status: row.status,
    transmission: row.transmission,
    seats: row.seats,
    photoUrl: row.photo_url,
  };
}

function mapVehicleCategory(row: VehicleCategoryTableRow): VehicleCategoryRow {
  return { id: row.id, name: row.name };
}

function mapKnowledgeBaseEntry(
  row: KnowledgeBaseTableRow,
): KnowledgeBaseEntryRow {
  return {
    id: row.id,
    topic: row.topic,
    question: row.question,
    answer: row.answer,
    updatedAt: row.updated_at,
  };
}

function mapLocation(row: LocationTableRow): LocationRow {
  return {
    id: row.id,
    name: row.name,
    isPickup: row.is_pickup,
    isDropoff: row.is_dropoff,
    extraFeeRs: row.extra_fee_rs,
    active: row.active,
  };
}

function mapBooking(row: BookingTableRow): BookingRow {
  return {
    id: row.id,
    bookingNumber: row.booking_number,
    customerId: row.customer_id,
    vehicleId: row.vehicle_id,
    pickupLocationId: row.pickup_location_id,
    dropoffLocationId: row.dropoff_location_id,
    pickupAt: row.pickup_at,
    returnAt: row.return_at,
    rentalDays: row.rental_days,
    dailyPriceRs: row.daily_price_rs,
    extrasRs: row.extras_rs,
    totalRs: row.total_rs,
    status: row.status,
    paymentStatus: row.payment_status,
    documentStatus: row.document_status,
    uploadToken: row.upload_token,
    uploadTokenExpiresAt: row.upload_token_expires_at,
    notes: row.notes,
  };
}

function patchToUpdate(patch: BookingPatch): BookingTableUpdate {
  const update: BookingTableUpdate = {};
  if (patch.vehicleId !== undefined) update.vehicle_id = patch.vehicleId;
  if (patch.pickupLocationId !== undefined)
    update.pickup_location_id = patch.pickupLocationId;
  if (patch.dropoffLocationId !== undefined)
    update.dropoff_location_id = patch.dropoffLocationId;
  if (patch.pickupAt !== undefined) update.pickup_at = patch.pickupAt;
  if (patch.returnAt !== undefined) update.return_at = patch.returnAt;
  if (patch.rentalDays !== undefined) update.rental_days = patch.rentalDays;
  if (patch.dailyPriceRs !== undefined)
    update.daily_price_rs = patch.dailyPriceRs;
  if (patch.extrasRs !== undefined) update.extras_rs = patch.extrasRs;
  if (patch.totalRs !== undefined) update.total_rs = patch.totalRs;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.uploadToken !== undefined) update.upload_token = patch.uploadToken;
  if (patch.uploadTokenExpiresAt !== undefined)
    update.upload_token_expires_at = patch.uploadTokenExpiresAt;
  return update;
}

/**
 * Supabase-backed implementation of the DomainDb port (see
 * /lib/domain/ports.ts). This is the only place in the app that translates
 * between the domain layer's camelCase rows and the database's schema —
 * /lib/domain itself never imports supabase-js.
 */
export function createSupabaseDomainDb(client: Client): DomainDb {
  return {
    async listActiveVehicles(filter) {
      let query = client.from("vehicles").select("*").eq("status", "ACTIVE");
      if (filter.categoryId) query = query.eq("category_id", filter.categoryId);
      if (filter.homeLocationId)
        query = query.eq("home_location_id", filter.homeLocationId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapVehicle);
    },

    async getVehicleById(id) {
      const { data, error } = await client
        .from("vehicles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapVehicle(data) : null;
    },

    async listVehicleCategories() {
      const { data, error } = await client
        .from("vehicle_categories")
        .select("*");
      if (error) throw error;
      return (data ?? []).map(mapVehicleCategory);
    },

    async getLocationById(id) {
      const { data, error } = await client
        .from("locations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapLocation(data) : null;
    },

    async findOverlappingVehicleIds(filter: OverlapFilter) {
      if (filter.vehicleIds.length === 0) return new Set();

      // Mirrors bookings_no_overlapping_vehicle_time: same excluded statuses,
      // same half-open [pickup_at, return_at) overlap test.
      let query = client
        .from("bookings")
        .select("vehicle_id")
        .in("vehicle_id", filter.vehicleIds)
        .neq("status", "CANCELLED")
        .neq("status", "ENQUIRY")
        .not("pickup_at", "is", null)
        .not("return_at", "is", null)
        .lt("pickup_at", filter.returnAt.toISOString())
        .gt("return_at", filter.pickupAt.toISOString());
      if (filter.excludeBookingId)
        query = query.neq("id", filter.excludeBookingId);

      const { data, error } = await query;
      if (error) throw error;
      return new Set(
        (data ?? [])
          .map((row) => row.vehicle_id)
          .filter((id): id is string => Boolean(id)),
      );
    },

    async getBookingById(id) {
      const { data, error } = await client
        .from("bookings")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapBooking(data) : null;
    },

    async getActiveBookingForCustomer(customerId) {
      const { data, error } = await client
        .from("bookings")
        .select("*")
        .eq("customer_id", customerId)
        .neq("status", "CANCELLED")
        .neq("status", "COMPLETED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapBooking(data) : null;
    },

    async createBooking(customerId) {
      const { data, error } = await client
        .from("bookings")
        .insert({ customer_id: customerId })
        .select("*")
        .single();
      if (error) throw error;
      return mapBooking(data);
    },

    async updateBooking(id, patch) {
      const { data, error } = await client
        .from("bookings")
        .update(patchToUpdate(patch))
        .eq("id", id)
        .select("*")
        .single();
      // Postgres errors (e.g. the 23P01 exclusion violation) come through
      // with a `code` field intact — see /lib/domain/pgErrors.ts.
      if (error) throw error;
      return mapBooking(data);
    },

    async recordEvent(event: BookingEventInput) {
      const { error } = await client.from("booking_events").insert({
        booking_id: event.bookingId,
        event_type: event.eventType,
        actor: event.actor,
        payload: (event.payload ?? null) as Json,
      });
      if (error) throw error;
    },

    async searchKnowledgeBase(query, limit) {
      // search_vector is generated (topic/question weighted above answer text —
      // see the knowledge_base_search migration). websearch_to_tsquery handles
      // plain natural-language queries without the caller needing tsquery syntax.
      const { data, error } = await client
        .from("knowledge_base")
        .select("*")
        .eq("active", true)
        .textSearch("search_vector", query, {
          type: "websearch",
          config: "english",
        })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map(mapKnowledgeBaseEntry);
    },

    async listActiveKnowledgeBase() {
      const { data, error } = await client
        .from("knowledge_base")
        .select("*")
        .eq("active", true)
        .order("topic");
      if (error) throw error;
      return (data ?? []).map(mapKnowledgeBaseEntry);
    },
  };
}
