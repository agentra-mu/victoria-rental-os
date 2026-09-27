import type { BookingStatus } from "./bookingStatus";

export type VehicleStatus = "ACTIVE" | "MAINTENANCE" | "RETIRED";
export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED";
export type DocumentStatus =
  "NOT_SUBMITTED" | "PENDING" | "VERIFIED" | "NEEDS_REVIEW" | "REJECTED";
export type BookingEventActor = "ai" | "owner" | "customer" | "system";

export interface VehicleRow {
  id: string;
  vehicleCode: string;
  make: string;
  model: string;
  categoryId: string;
  dailyPriceRs: number;
  homeLocationId: string | null;
  status: VehicleStatus;
  transmission: string | null;
  seats: number | null;
  photoUrl: string | null;
}

export interface VehicleCategoryRow {
  id: string;
  name: string;
}

export interface KnowledgeBaseEntryRow {
  id: string;
  topic: string;
  question: string;
  answer: string;
  updatedAt: string;
}

export interface LocationRow {
  id: string;
  name: string;
  isPickup: boolean;
  isDropoff: boolean;
  extraFeeRs: number;
  active: boolean;
}

export interface BookingRow {
  id: string;
  bookingNumber: number;
  customerId: string;
  vehicleId: string | null;
  pickupLocationId: string | null;
  dropoffLocationId: string | null;
  /** ISO instants (UTC) — see CLAUDE.md: store UTC, display Indian/Mauritius. */
  pickupAt: string | null;
  returnAt: string | null;
  rentalDays: number | null;
  dailyPriceRs: number | null;
  extrasRs: number;
  totalRs: number | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  documentStatus: DocumentStatus;
  uploadToken: string | null;
  uploadTokenExpiresAt: string | null;
  notes: string | null;
}

export interface OverlapFilter {
  vehicleIds: string[];
  pickupAt: Date;
  returnAt: Date;
  /** Excluded from the check — used when re-checking a booking against itself. */
  excludeBookingId?: string;
}

export interface BookingPatch {
  vehicleId?: string | null;
  pickupLocationId?: string | null;
  dropoffLocationId?: string | null;
  pickupAt?: string | null;
  returnAt?: string | null;
  rentalDays?: number | null;
  dailyPriceRs?: number | null;
  extrasRs?: number;
  totalRs?: number | null;
  status?: BookingStatus;
  uploadToken?: string | null;
  uploadTokenExpiresAt?: string | null;
}

export interface BookingEventInput {
  bookingId: string;
  eventType: string;
  actor: BookingEventActor;
  payload?: Record<string, unknown>;
}

/**
 * Everything the domain layer needs from storage, narrowed to exactly the
 * operations the functions in /lib/domain use. Tests implement this with an
 * in-memory fake (see /lib/domain/testing/fakeDb.ts); production uses the
 * Supabase-backed adapter in /lib/db/domainDb.ts. Keeping the surface this
 * small is what makes the domain functions unit-testable without Postgres.
 */
export interface DomainDb {
  listActiveVehicles(filter: {
    categoryId?: string;
    homeLocationId?: string;
  }): Promise<VehicleRow[]>;
  getVehicleById(id: string): Promise<VehicleRow | null>;
  listVehicleCategories(): Promise<VehicleCategoryRow[]>;
  getLocationById(id: string): Promise<LocationRow | null>;
  /** Subset of the given vehicle ids that have a conflicting active booking. */
  findOverlappingVehicleIds(filter: OverlapFilter): Promise<Set<string>>;
  getBookingById(id: string): Promise<BookingRow | null>;
  createBooking(customerId: string): Promise<BookingRow>;
  updateBooking(id: string, patch: BookingPatch): Promise<BookingRow>;
  recordEvent(event: BookingEventInput): Promise<void>;
  /** Full-text search over active knowledge_base entries, best matches first. */
  searchKnowledgeBase(
    query: string,
    limit: number,
  ): Promise<KnowledgeBaseEntryRow[]>;
  listActiveKnowledgeBase(): Promise<KnowledgeBaseEntryRow[]>;
}
