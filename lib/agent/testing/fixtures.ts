import { createFakeDb, type FakeDbSeed } from "@/lib/domain/testing/fakeDb";
import { createFakeMessagingDb } from "@/lib/whatsapp/testing/fakeMessagingDb";
import type {
  KnowledgeBaseEntryRow,
  LocationRow,
  VehicleCategoryRow,
  VehicleRow,
} from "@/lib/domain/ports";

export const CATEGORY_ECONOMY: VehicleCategoryRow = {
  id: "cat-economy",
  name: "Economy",
};
export const CATEGORY_SUV: VehicleCategoryRow = { id: "cat-suv", name: "SUV" };

export const LOCATION_AIRPORT: LocationRow = {
  id: "loc-airport",
  name: "SSR International Airport",
  isPickup: true,
  isDropoff: true,
  extraFeeRs: 500,
  active: true,
};

export const LOCATION_GRAND_BAIE: LocationRow = {
  id: "loc-grandbaie",
  name: "Grand Baie",
  isPickup: true,
  isDropoff: true,
  extraFeeRs: 0,
  active: true,
};

export const VEHICLE_VITZ: VehicleRow = {
  id: "veh-vitz",
  vehicleCode: "VITZ-1",
  make: "Toyota",
  model: "Vitz",
  categoryId: CATEGORY_ECONOMY.id,
  dailyPriceRs: 1200,
  homeLocationId: LOCATION_AIRPORT.id,
  status: "ACTIVE",
  transmission: "Automatic",
  seats: 5,
  photoUrl: null,
};

export const VEHICLE_SWIFT: VehicleRow = {
  id: "veh-swift",
  vehicleCode: "SWIFT-1",
  make: "Suzuki",
  model: "Swift",
  categoryId: CATEGORY_ECONOMY.id,
  dailyPriceRs: 1300,
  homeLocationId: LOCATION_GRAND_BAIE.id,
  status: "ACTIVE",
  transmission: "Manual",
  seats: 5,
  photoUrl: null,
};

export const VEHICLE_VITARA: VehicleRow = {
  id: "veh-vitara",
  vehicleCode: "VITARA-1",
  make: "Suzuki",
  model: "Vitara",
  categoryId: CATEGORY_SUV.id,
  dailyPriceRs: 2500,
  homeLocationId: LOCATION_GRAND_BAIE.id,
  status: "ACTIVE",
  transmission: "Automatic",
  seats: 5,
  photoUrl: null,
};

export const KNOWLEDGE_BASE: KnowledgeBaseEntryRow[] = [
  {
    id: "kb-payment",
    topic: "Payment",
    question: "Do you accept credit cards?",
    answer: "We only accept cash, paid when you collect the car.",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "kb-cancellation",
    topic: "Cancellation",
    question: "Can I cancel my booking?",
    answer: "Yes — message us on WhatsApp and we'll sort it out with you.",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

export function agentFixtureSeed(): FakeDbSeed {
  return {
    vehicleCategories: [CATEGORY_ECONOMY, CATEGORY_SUV],
    locations: [LOCATION_AIRPORT, LOCATION_GRAND_BAIE],
    vehicles: [VEHICLE_VITZ, VEHICLE_SWIFT, VEHICLE_VITARA],
    knowledgeBase: KNOWLEDGE_BASE,
  };
}

/** A ready-to-use fake DomainDb + MessagingDb pair sharing the same fleet/locations/knowledge base. */
export function createAgentFixture(seed: FakeDbSeed = agentFixtureSeed()) {
  const fakeDb = createFakeDb(seed);
  const fakeMessaging = createFakeMessagingDb();
  return { fakeDb, fakeMessaging };
}
