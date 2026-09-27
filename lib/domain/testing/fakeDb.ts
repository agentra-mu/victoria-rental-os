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
} from "../ports";

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Mirrors bookings_no_overlapping_vehicle_time's WHERE clause exactly. */
const EXCLUDED_FROM_CONSTRAINT = new Set(["CANCELLED", "ENQUIRY"]);

export interface FakeDbSeed {
  vehicles?: VehicleRow[];
  vehicleCategories?: VehicleCategoryRow[];
  locations?: LocationRow[];
  bookings?: BookingRow[];
  knowledgeBase?: KnowledgeBaseEntryRow[];
}

let bookingCounter = 1000;

/**
 * In-memory stand-in for the Supabase-backed DomainDb, used by the pure
 * Vitest suites in this directory. `updateBooking` replicates the Postgres
 * exclusion constraint (same shape of error, same SQLSTATE) so
 * confirmBooking's catch-and-convert path can be exercised without a real
 * database.
 */
export function createFakeDb(seed: FakeDbSeed = {}) {
  const vehicles = new Map(seed.vehicles?.map((v) => [v.id, v]) ?? []);
  const vehicleCategories = new Map(
    seed.vehicleCategories?.map((c) => [c.id, c]) ?? [],
  );
  const locations = new Map(seed.locations?.map((l) => [l.id, l]) ?? []);
  const bookings = new Map(seed.bookings?.map((b) => [b.id, b]) ?? []);
  const knowledgeBase = new Map(
    seed.knowledgeBase?.map((k) => [k.id, k]) ?? [],
  );
  const events: BookingEventInput[] = [];

  const db: DomainDb = {
    async listActiveVehicles(filter) {
      return Array.from(vehicles.values()).filter((v) => {
        if (v.status !== "ACTIVE") return false;
        if (filter.categoryId && v.categoryId !== filter.categoryId)
          return false;
        if (filter.homeLocationId && v.homeLocationId !== filter.homeLocationId)
          return false;
        return true;
      });
    },

    async getVehicleById(id) {
      return vehicles.get(id) ?? null;
    },

    async listVehicleCategories() {
      return Array.from(vehicleCategories.values());
    },

    async getLocationById(id) {
      return locations.get(id) ?? null;
    },

    async findOverlappingVehicleIds(filter: OverlapFilter) {
      const result = new Set<string>();
      for (const booking of bookings.values()) {
        if (booking.id === filter.excludeBookingId) continue;
        if (EXCLUDED_FROM_CONSTRAINT.has(booking.status)) continue;
        if (!booking.vehicleId || !booking.pickupAt || !booking.returnAt)
          continue;
        if (!filter.vehicleIds.includes(booking.vehicleId)) continue;
        if (
          overlaps(
            filter.pickupAt,
            filter.returnAt,
            new Date(booking.pickupAt),
            new Date(booking.returnAt),
          )
        ) {
          result.add(booking.vehicleId);
        }
      }
      return result;
    },

    async getBookingById(id) {
      return bookings.get(id) ?? null;
    },

    async getActiveBookingForCustomer(customerId) {
      const matches = Array.from(bookings.values()).filter(
        (b) =>
          b.customerId === customerId &&
          b.status !== "CANCELLED" &&
          b.status !== "COMPLETED",
      );
      return matches.length > 0 ? matches[matches.length - 1] : null;
    },

    async createBooking(customerId) {
      const id = `booking-${bookingCounter}`;
      const booking: BookingRow = {
        id,
        bookingNumber: bookingCounter++,
        customerId,
        vehicleId: null,
        pickupLocationId: null,
        dropoffLocationId: null,
        pickupAt: null,
        returnAt: null,
        rentalDays: null,
        dailyPriceRs: null,
        extrasRs: 0,
        totalRs: null,
        status: "ENQUIRY",
        paymentStatus: "UNPAID",
        documentStatus: "NOT_SUBMITTED",
        uploadToken: null,
        uploadTokenExpiresAt: null,
        notes: null,
      };
      bookings.set(id, booking);
      return booking;
    },

    async updateBooking(id, patch: BookingPatch) {
      const existing = bookings.get(id);
      if (!existing) throw new Error(`No fake booking ${id}`);
      const updated: BookingRow = { ...existing, ...patch };

      if (
        updated.vehicleId &&
        updated.pickupAt &&
        updated.returnAt &&
        !EXCLUDED_FROM_CONSTRAINT.has(updated.status)
      ) {
        for (const other of bookings.values()) {
          if (other.id === id) continue;
          if (EXCLUDED_FROM_CONSTRAINT.has(other.status)) continue;
          if (other.vehicleId !== updated.vehicleId) continue;
          if (!other.pickupAt || !other.returnAt) continue;
          if (
            overlaps(
              new Date(updated.pickupAt),
              new Date(updated.returnAt),
              new Date(other.pickupAt),
              new Date(other.returnAt),
            )
          ) {
            throw {
              code: "23P01",
              message: "conflicting key value violates exclusion constraint",
            };
          }
        }
      }

      bookings.set(id, updated);
      return updated;
    },

    async recordEvent(event) {
      events.push(event);
    },

    async searchKnowledgeBase(query, limit) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = Array.from(knowledgeBase.values())
        .map((entry) => {
          const topicAndQuestion =
            `${entry.topic} ${entry.question}`.toLowerCase();
          const answer = entry.answer.toLowerCase();
          let score = 0;
          for (const term of terms) {
            if (topicAndQuestion.includes(term)) score += 2;
            if (answer.includes(term)) score += 1;
          }
          return { entry, score };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score);
      return scored.slice(0, limit).map((row) => row.entry);
    },

    async listActiveKnowledgeBase() {
      return Array.from(knowledgeBase.values());
    },
  };

  return {
    db,
    vehicles,
    vehicleCategories,
    locations,
    bookings,
    knowledgeBase,
    events,
  };
}
