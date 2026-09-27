import type { BookingRow, LocationRow, VehicleRow } from "../ports";

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
    ...overrides,
  };
}
