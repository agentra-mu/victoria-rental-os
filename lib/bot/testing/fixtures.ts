import type {
  LocationRow,
  VehicleCategoryRow,
  VehicleRow,
} from "@/lib/domain/ports";
import type { FakeDbSeed } from "@/lib/domain/testing/fakeDb";
import type { KbEntry } from "../ports";

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

const vehicle = (
  id: string,
  make: string,
  model: string,
  categoryId: string,
  price: number,
  home: string,
): VehicleRow => ({
  id,
  vehicleCode: id.toUpperCase(),
  make,
  model,
  categoryId,
  dailyPriceRs: price,
  homeLocationId: home,
  status: "ACTIVE",
  transmission: "Automatic",
  seats: 5,
  photoUrl: null,
});

export const VEHICLE_VITZ = vehicle(
  "veh-vitz",
  "Toyota",
  "Vitz",
  CATEGORY_ECONOMY.id,
  1200,
  LOCATION_AIRPORT.id,
);
export const VEHICLE_SWIFT = vehicle(
  "veh-swift",
  "Suzuki",
  "Swift",
  CATEGORY_ECONOMY.id,
  1300,
  LOCATION_GRAND_BAIE.id,
);
export const VEHICLE_VITARA = vehicle(
  "veh-vitara",
  "Suzuki",
  "Vitara",
  CATEGORY_SUV.id,
  2500,
  LOCATION_GRAND_BAIE.id,
);

export const KB: KbEntry[] = [
  {
    id: "kb-payment",
    topic: "payment",
    question: "Can I pay by card or bank transfer?",
    answer:
      "We only accept cash, paid in Mauritian Rupees (Rs) when you collect the car. We don't take card payments.",
    questionFr: "Puis-je payer par carte ?",
    answerFr:
      "Nous acceptons uniquement les espèces, en roupies (Rs), à la remise des clés. Pas de paiement par carte.",
    keywords: ["pay by card"],
    intentKey: "payment_methods",
  },
  {
    id: "kb-hours",
    topic: "hours",
    question: "What are your opening hours?",
    answer:
      "Most locations are open 08:00-18:00 Monday to Saturday. The airport counter is open 06:00-22:00 every day.",
    questionFr: "Quels sont vos horaires ?",
    answerFr:
      "La plupart des agences sont ouvertes de 08h00 à 18h00 du lundi au samedi. Le comptoir de l'aéroport est ouvert de 06h00 à 22h00 tous les jours.",
    keywords: [],
    intentKey: "opening_hours",
  },
  {
    id: "kb-docs",
    topic: "requirements",
    question: "What do I need to rent a car?",
    answer:
      "A valid passport or national ID and a driving permit held for at least 1 year. You are at least 21 years old.",
    questionFr: "De quoi ai-je besoin ?",
    answerFr:
      "Un passeport ou une carte d'identité valide et un permis de conduire de plus d'un an. Vous avez au moins 21 ans.",
    keywords: [],
    intentKey: "documents_required",
  },
  {
    id: "kb-cancel",
    topic: "cancellation",
    question: "What is your cancellation policy?",
    answer: "You can cancel free of charge up to 24 hours before pickup.",
    questionFr: null,
    answerFr: null,
    keywords: [],
    intentKey: "cancellation",
  },
];

export const ALIASES: Record<string, string[]> = {
  [LOCATION_AIRPORT.id]: ["airport", "SSR", "aeroport"],
  [LOCATION_GRAND_BAIE.id]: ["grand bay"],
};

export function fixtureSeed(): FakeDbSeed {
  return {
    vehicleCategories: [CATEGORY_ECONOMY, CATEGORY_SUV],
    locations: [LOCATION_AIRPORT, LOCATION_GRAND_BAIE],
    vehicles: [VEHICLE_VITZ, VEHICLE_SWIFT, VEHICLE_VITARA],
  };
}
