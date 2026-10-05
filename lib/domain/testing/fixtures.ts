import type {
  BookingRow,
  DocumentRow,
  KnowledgeBaseEntryRow,
  LocationRow,
  VehicleCategoryRow,
  VehicleRow,
} from "../ports";

export function vehicle(
  overrides: Partial<VehicleRow> & { id: string },
): VehicleRow {
  return {
    vehicleCode: `CAR-${overrides.id}`,
    make: "Toyota",
    model: "Vitz",
    categoryId: "cat-economy",
    dailyPriceRs: 1200,
    homeLocationId: null,
    status: "ACTIVE",
    transmission: "Manual",
    seats: 5,
    photoUrl: null,
    ...overrides,
  };
}

export function vehicleCategory(
  overrides: Partial<VehicleCategoryRow> & { id: string },
): VehicleCategoryRow {
  return {
    name: `Category ${overrides.id}`,
    ...overrides,
  };
}

export function knowledgeBaseEntry(
  overrides: Partial<KnowledgeBaseEntryRow> & { id: string },
): KnowledgeBaseEntryRow {
  return {
    topic: "general",
    question: `Question ${overrides.id}`,
    answer: `Answer ${overrides.id}`,
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function location(
  overrides: Partial<LocationRow> & { id: string },
): LocationRow {
  return {
    name: `Location ${overrides.id}`,
    isPickup: true,
    isDropoff: true,
    extraFeeRs: 0,
    active: true,
    ...overrides,
  };
}

export function booking(
  overrides: Partial<BookingRow> & { id: string },
): BookingRow {
  return {
    bookingNumber: 1000,
    customerId: "cust-1",
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
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function document(
  overrides: Partial<DocumentRow> & { id: string },
): DocumentRow {
  return {
    bookingId: "booking-1000",
    customerId: "cust-1",
    docType: "PASSPORT",
    storagePath: `documents/booking-1000/PASSPORT-${overrides.id}.jpg`,
    mimeType: "image/jpeg",
    uploadedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}
