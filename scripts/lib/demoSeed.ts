/**
 * Demo data: wipes every operational table and re-seeds it with dates relative
 * to "now" (Indian/Mauritius, UTC+4, no DST), so "tomorrow's pickup" is always
 * tomorrow. Used by scripts/reset-demo.ts. Seed data is entirely fictional.
 */
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSONAS } from "../../lib/demo/personas.ts";

export { PERSONAS };

export const DEMO_EMAIL = "demo@victoria-demo.example";

const HOUR = 3600_000;

/** Mauritius-local wall-clock time `dayOffset` days from today, as a UTC Date. */
function mu(dayOffset: number, hour: number, minute = 0, now = new Date()) {
  const local = new Date(now.getTime() + 4 * HOUR);
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + dayOffset,
      hour - 4,
      minute,
    ),
  );
}

const ago = (hours: number) => new Date(Date.now() - hours * HOUR);
const ahead = (hours: number) => new Date(Date.now() + hours * HOUR);
/** Rounded to the hour so "now"-relative times still look tidy. */
const roundHour = (d: Date) => new Date(Math.round(d.getTime() / HOUR) * HOUR);

/** Same rule as lib/domain/calculateRentalDays (24h blocks, 60 min grace). */
function rentalDays(pickup: Date, ret: Date) {
  const billable = Math.max(ret.getTime() - pickup.getTime() - 60 * 60_000, 0);
  return Math.max(1, Math.ceil(billable / (24 * HOUR)));
}

function must<D>(
  res: { data: D; error: { message: string } | null },
  what: string,
): NonNullable<D> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as NonNullable<D>;
}

const week = (
  open: string,
  close: string,
  sat: [string, string] | null,
  sun: [string, string] | null,
) => ({
  mon: [open, close],
  tue: [open, close],
  wed: [open, close],
  thu: [open, close],
  fri: [open, close],
  sat,
  sun,
});

const LOCATIONS = [
  {
    key: "airport",
    name: "SSR International Airport",
    fee: 500,
    afterHours: true,
    afterFee: 300,
    hours: week("06:00", "22:00", ["06:00", "22:00"], ["06:00", "22:00"]),
    instructions:
      "Meet our agent at the car rental desk in the arrivals hall, just after customs. We track your flight; call us on arrival if you can't find us.",
    maps: "https://maps.google.com/?q=SSR+International+Airport+Mauritius",
  },
  {
    key: "grandbaie",
    name: "Grand Baie",
    fee: 0,
    afterHours: false,
    afterFee: 0,
    hours: week("08:00", "18:00", ["08:00", "13:00"], null),
    instructions:
      "Our office is next to the Grand Baie bus station, opposite the pharmacy. Free parking at the back.",
    maps: "https://maps.google.com/?q=Grand+Baie+Mauritius",
  },
  {
    key: "portlouis",
    name: "Port Louis",
    fee: 0,
    afterHours: false,
    afterFee: 0,
    hours: week("08:00", "17:00", ["08:00", "12:00"], null),
    instructions:
      "Near the Caudan Waterfront. Ask reception at the Caudan car park to call us on arrival.",
    maps: "https://maps.google.com/?q=Caudan+Waterfront+Port+Louis",
  },
  {
    key: "flic",
    name: "Flic-en-Flac",
    fee: 0,
    afterHours: false,
    afterFee: 0,
    hours: week("08:00", "18:00", ["08:00", "18:00"], ["08:00", "13:00"]),
    instructions:
      "Opposite the public beach entrance, beside the supermarket. Look for the Victoria Car Rental sign.",
    maps: "https://maps.google.com/?q=Flic+en+Flac+Mauritius",
  },
  {
    key: "qb",
    name: "Quatre Bornes",
    fee: 0,
    afterHours: false,
    afterFee: 0,
    hours: week("08:00", "17:00", ["08:00", "12:00"], null),
    instructions:
      "Behind the Quatre Bornes market, on Avenue de la Gare. Park in the market car park.",
    maps: "https://maps.google.com/?q=Quatre+Bornes+Mauritius",
  },
  {
    key: "tamarin",
    name: "Tamarin",
    fee: 0,
    afterHours: false,
    afterFee: 0,
    hours: week("08:00", "18:00", ["08:00", "13:00"], null),
    instructions:
      "Near Tamarin Bay. Ask for the La Villa car park; our agent will meet you there.",
    maps: "https://maps.google.com/?q=Tamarin+Mauritius",
  },
] as const;
type LocKey = (typeof LOCATIONS)[number]["key"];

const CATEGORIES = [
  {
    name: "Economy",
    description: "Small, fuel-efficient cars for couples and city driving.",
  },
  { name: "Sedan", description: "Comfortable four-door cars with a big boot." },
  {
    name: "SUV",
    description: "Spacious 5-7 seat vehicles for families and long trips.",
  },
];

const ph = (t: string) =>
  `https://placehold.co/640x400/e2e8f0/334155/png?text=${encodeURIComponent(t)}`;

// Mauritian-style registration: 4 digits, 2 letters, 2-digit registration year. All fictional.
const VEHICLES = [
  {
    key: "vitz1",
    make: "Toyota",
    model: "Vitz",
    cat: "Economy",
    reg: "4821 AB 22",
    price: 1400,
    seats: 5,
    home: "airport",
    mileage: 41200,
  },
  {
    key: "vitz2",
    make: "Toyota",
    model: "Vitz",
    cat: "Economy",
    reg: "1377 CD 21",
    price: 1400,
    seats: 5,
    home: "airport",
    mileage: 58900,
  },
  {
    key: "vitz3",
    make: "Toyota",
    model: "Vitz",
    cat: "Economy",
    reg: "9062 EF 23",
    price: 1400,
    seats: 5,
    home: "grandbaie",
    mileage: 22400,
  },
  {
    key: "swift1",
    make: "Suzuki",
    model: "Swift",
    cat: "Economy",
    reg: "3350 GH 22",
    price: 1500,
    seats: 5,
    home: "airport",
    mileage: 36700,
  },
  {
    key: "swift2",
    make: "Suzuki",
    model: "Swift",
    cat: "Economy",
    reg: "7714 JK 23",
    price: 1500,
    seats: 5,
    home: "qb",
    mileage: 18800,
  },
  {
    key: "fit1",
    make: "Honda",
    model: "Fit",
    cat: "Economy",
    reg: "2208 LM 22",
    price: 1600,
    seats: 5,
    home: "grandbaie",
    mileage: 44100,
  },
  {
    key: "fit2",
    make: "Honda",
    model: "Fit",
    cat: "Economy",
    reg: "5649 NP 21",
    price: 1600,
    seats: 5,
    home: "portlouis",
    mileage: 63500,
  },
  {
    key: "corolla1",
    make: "Toyota",
    model: "Corolla",
    cat: "Sedan",
    reg: "8830 QR 23",
    price: 2200,
    seats: 5,
    home: "airport",
    mileage: 27300,
  },
  {
    key: "corolla2",
    make: "Toyota",
    model: "Corolla",
    cat: "Sedan",
    reg: "6195 ST 22",
    price: 2200,
    seats: 5,
    home: "portlouis",
    mileage: 39800,
  },
  {
    key: "xtrail1",
    make: "Nissan",
    model: "X-Trail",
    cat: "SUV",
    reg: "1043 UV 23",
    price: 3200,
    seats: 7,
    home: "airport",
    mileage: 19600,
  },
  {
    key: "xtrail2",
    make: "Nissan",
    model: "X-Trail",
    cat: "SUV",
    reg: "7521 WX 22",
    price: 3200,
    seats: 7,
    home: "flic",
    mileage: 45200,
    insuranceDays: 18,
  },
  {
    key: "tucson",
    make: "Hyundai",
    model: "Tucson",
    cat: "SUV",
    reg: "3987 YZ 23",
    price: 3500,
    seats: 5,
    home: "tamarin",
    mileage: 15400,
  },
] as const;
type VehKey = (typeof VEHICLES)[number]["key"];

const CUSTOMERS = [
  {
    key: "priya",
    name: "Priya Doorgakant",
    phone: PERSONAS.existingCustomer,
    email: "priya.d@example.com",
  },
  { key: "kevin", name: "Kevin Ramsamy", phone: "+23057000003", email: null },
  {
    key: "marieclaire",
    name: "Marie-Claire Beeharry",
    phone: "+23057000004",
    email: "mc.beeharry@example.com",
  },
  {
    key: "ashvin",
    name: "Ashvin Gungadin",
    phone: "+23057000005",
    email: null,
  },
  {
    key: "sophie",
    name: "Sophie Hardy",
    phone: "+23057000006",
    email: "sophie.hardy@example.com",
  },
  { key: "jason", name: "Jason Li Yuen", phone: "+23057000007", email: null },
  {
    key: "nadia",
    name: "Nadia Soobratty",
    phone: "+23057000008",
    email: "nadia.s@example.com",
  },
  { key: "vikash", name: "Vikash Jhurry", phone: "+23057000009", email: null },
] as const;
type CustKey = (typeof CUSTOMERS)[number]["key"];

const KNOWLEDGE: [string, string, string][] = [
  [
    "hours",
    "What are your opening hours?",
    "Most locations are open 08:00-18:00 Monday to Friday and shorter hours on Saturday (Quatre Bornes and Port Louis close at 17:00 on weekdays). Most are closed on Sunday, except Flic-en-Flac (08:00-13:00) and the airport desk (06:00-22:00, every day).",
  ],
  [
    "payment",
    "How do I pay?",
    "Payment is cash only, in Mauritian Rupees (Rs), when you collect the car. We don't take card payments, bank transfers or advance deposits.",
  ],
  [
    "payment",
    "Can I pay by card or bank transfer?",
    "No - we are cash only, paid at pickup. If that is difficult for you, message us and a team member will help.",
  ],
  [
    "requirements",
    "What do I need to rent a car?",
    "A valid passport or national ID, a valid driving permit held for at least 1 year, and you must be 21 or older. After booking you upload photos of your documents through a secure link.",
  ],
  [
    "requirements",
    "Can I rent if I'm under 21?",
    "Our standard minimum age is 21. If you are younger, tell us and the team will check what is possible.",
  ],
  [
    "fuel",
    "What is the fuel policy?",
    "Cars are handed over with a full tank and should be returned full. If not, a refuelling charge applies.",
  ],
  [
    "mileage",
    "Is there a mileage limit?",
    "No. Mileage on the island is unlimited.",
  ],
  [
    "cancellation",
    "What is your cancellation policy?",
    "Free cancellation up to 24 hours before pickup. Later cancellations or no-shows may be charged - ask us about your booking.",
  ],
  [
    "late-returns",
    "What happens if I return the car late?",
    "A grace period of 60 minutes applies. After that a late fee is charged. If you know you will be late, tell us as early as possible - we record your request and the team confirms; a delay is never automatically approved.",
  ],
  [
    "documents",
    "Why do you need my passport and driving permit?",
    "Mauritian regulations require us to verify the identity and driving permit of every renter. Documents are stored securely and used only for that purpose.",
  ],
  [
    "documents",
    "Is my document upload secure?",
    "Yes. Uploads go through a private link tied to your booking and are kept in private storage that only authorised staff can open.",
  ],
  [
    "extras",
    "Do you offer child seats?",
    "Yes, on request - tell us when you book and we will reserve one.",
  ],
  [
    "extras",
    "Can I add a second driver?",
    "Yes. The additional driver must also provide a valid driving permit for verification.",
  ],
  [
    "insurance",
    "Is insurance included?",
    "Basic insurance is included in every rental. Ask the team about the excess amount and optional cover upgrades.",
  ],
  [
    "breakdown",
    "What if the car breaks down?",
    "Contact us immediately on this chat or on the number in your booking confirmation and we will arrange assistance or a replacement.",
  ],
  [
    "airport",
    "Can I pick up at the airport?",
    "Yes. Our agent meets you at the car rental desk in the arrivals hall, after customs. The airport desk is open 06:00-22:00 every day. A Rs 500 airport fee applies and is included in your quote.",
  ],
  [
    "airport",
    "Can I collect the car after hours, for a late flight?",
    "At the airport, yes - an after-hours fee of Rs 300 applies. Other locations don't offer after-hours pickup.",
  ],
  [
    "delivery",
    "Do you deliver to hotels or to Grand Baie?",
    "We have offices in Grand Baie, Port Louis, Flic-en-Flac, Quatre Bornes and Tamarin, plus the airport. You can pick up and drop off at any of them. Delivery to other addresses (such as a hotel) is not automatic - the team can check if it's possible.",
  ],
  [
    "rental",
    "Is there a minimum rental period?",
    "The minimum rental is 1 day (24 hours).",
  ],
  [
    "rental",
    "Can I drop the car at a different location?",
    "Yes, pickup and drop-off locations can differ. The fee for each location, if any, is included in your price quote.",
  ],
  [
    "rental",
    "Can I extend my rental?",
    "Yes, subject to availability. Message us as early as possible: we record your request and the team confirms whether the extension is possible and the extra cost.",
  ],
];

interface BookingSpec {
  key: string;
  cust: CustKey;
  veh: VehKey;
  pickupLoc: LocKey;
  dropoffLoc: LocKey;
  pickup: Date;
  ret: Date;
  status: string;
  docStatus: "NOT_SUBMITTED" | "PENDING" | "VERIFIED" | "NEEDS_REVIEW";
  paid?: boolean;
  uploadToken?: boolean;
  docs?: "VERIFIED" | "NEEDS_REVIEW";
  notes?: string;
  createdHoursAgo: number;
}

function bookingSpecs(): BookingSpec[] {
  const now = new Date();
  return [
    // Persona "existing customer": Vitz out now, due back tomorrow.
    {
      key: "b_priya_out",
      cust: "priya",
      veh: "vitz1",
      pickupLoc: "airport",
      dropoffLoc: "airport",
      pickup: mu(-1, 10, 0, now),
      ret: mu(1, 10, 0, now),
      status: "PICKED_UP",
      docStatus: "VERIFIED",
      docs: "VERIFIED",
      createdHoursAgo: 120,
    },
    // Out now, picked up a couple of hours ago, already paid in cash.
    {
      key: "b_kevin_out",
      cust: "kevin",
      veh: "swift1",
      pickupLoc: "airport",
      dropoffLoc: "airport",
      pickup: roundHour(ago(2)),
      ret: mu(3, 12, 0, now),
      status: "PICKED_UP",
      docStatus: "VERIFIED",
      docs: "VERIFIED",
      paid: true,
      createdHoursAgo: 72,
    },
    // Due back today.
    {
      key: "b_mc_returning",
      cust: "marieclaire",
      veh: "corolla1",
      pickupLoc: "flic",
      dropoffLoc: "airport",
      pickup: mu(-4, 9, 0, now),
      ret: roundHour(ahead(3)),
      status: "PICKED_UP",
      docStatus: "VERIFIED",
      docs: "VERIFIED",
      createdHoursAgo: 200,
    },
    // Confirmed upcoming.
    {
      key: "b_ashvin_tomorrow",
      cust: "ashvin",
      veh: "xtrail1",
      pickupLoc: "airport",
      dropoffLoc: "airport",
      pickup: mu(1, 9, 0, now),
      ret: mu(6, 9, 0, now),
      status: "CONFIRMED",
      docStatus: "VERIFIED",
      docs: "VERIFIED",
      createdHoursAgo: 40,
    },
    {
      key: "b_sophie_upcoming",
      cust: "sophie",
      veh: "fit1",
      pickupLoc: "grandbaie",
      dropoffLoc: "grandbaie",
      pickup: mu(3, 10, 0, now),
      ret: mu(7, 10, 0, now),
      status: "CONFIRMED",
      docStatus: "VERIFIED",
      createdHoursAgo: 30,
    },
    {
      key: "b_jason_upcoming",
      cust: "jason",
      veh: "tucson",
      pickupLoc: "tamarin",
      dropoffLoc: "flic",
      pickup: mu(6, 9, 30, now),
      ret: mu(10, 9, 30, now),
      status: "CONFIRMED",
      docStatus: "VERIFIED",
      createdHoursAgo: 20,
    },
    // Waiting for documents.
    {
      key: "b_nadia_docs",
      cust: "nadia",
      veh: "vitz2",
      pickupLoc: "airport",
      dropoffLoc: "airport",
      pickup: mu(2, 14, 0, now),
      ret: mu(5, 14, 0, now),
      status: "PENDING_DOCUMENTS",
      docStatus: "NOT_SUBMITTED",
      uploadToken: true,
      createdHoursAgo: 3,
    },
    // Documents uploaded, flagged for human review.
    {
      key: "b_vikash_review",
      cust: "vikash",
      veh: "swift2",
      pickupLoc: "qb",
      dropoffLoc: "qb",
      pickup: mu(2, 9, 0, now),
      ret: mu(4, 9, 0, now),
      status: "PENDING_DOCUMENTS",
      docStatus: "NEEDS_REVIEW",
      docs: "NEEDS_REVIEW",
      uploadToken: true,
      createdHoursAgo: 5,
    },
    // History.
    {
      key: "b_priya_done",
      cust: "priya",
      veh: "corolla2",
      pickupLoc: "portlouis",
      dropoffLoc: "portlouis",
      pickup: mu(-20, 9, 0, now),
      ret: mu(-16, 9, 0, now),
      status: "COMPLETED",
      docStatus: "VERIFIED",
      paid: true,
      createdHoursAgo: 24 * 25,
    },
    {
      key: "b_kevin_done",
      cust: "kevin",
      veh: "fit2",
      pickupLoc: "portlouis",
      dropoffLoc: "portlouis",
      pickup: mu(-12, 10, 0, now),
      ret: mu(-9, 10, 0, now),
      status: "COMPLETED",
      docStatus: "VERIFIED",
      paid: true,
      createdHoursAgo: 24 * 16,
    },
    {
      key: "b_nadia_done",
      cust: "nadia",
      veh: "xtrail2",
      pickupLoc: "flic",
      dropoffLoc: "flic",
      pickup: mu(-30, 9, 0, now),
      ret: mu(-24, 9, 0, now),
      status: "COMPLETED",
      docStatus: "VERIFIED",
      paid: true,
      createdHoursAgo: 24 * 35,
    },
    // Cancelled.
    {
      key: "b_sophie_cancelled",
      cust: "sophie",
      veh: "vitz3",
      pickupLoc: "grandbaie",
      dropoffLoc: "grandbaie",
      pickup: mu(5, 10, 0, now),
      ret: mu(8, 10, 0, now),
      status: "CANCELLED",
      docStatus: "NOT_SUBMITTED",
      notes: "Cancelled by customer (change of plans).",
      createdHoursAgo: 60,
    },
  ];
}

/** A clearly fake sample "document" image so the dashboard viewer works without real IDs. */
async function sampleDocImage(title: string, name: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
    <rect width="900" height="600" fill="#f1f5f9"/><rect x="20" y="20" width="860" height="560" fill="none" stroke="#94a3b8" stroke-width="4" stroke-dasharray="14 8"/>
    <text x="450" y="150" font-size="44" font-family="sans-serif" text-anchor="middle" fill="#334155">${title}</text>
    <text x="450" y="260" font-size="36" font-family="sans-serif" text-anchor="middle" fill="#0f172a">${name}</text>
    <text x="450" y="340" font-size="26" font-family="sans-serif" text-anchor="middle" fill="#64748b">Doc no. DEMO-000000</text>
    <text x="450" y="500" font-size="32" font-family="sans-serif" text-anchor="middle" fill="#dc2626">SAMPLE - DEMO DATA ONLY</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const WIPE_ORDER = [
  "audit_log",
  "booking_change_requests",
  "scheduled_messages",
  "document_verifications",
  "documents",
  "payments",
  "booking_events",
  "owner_notifications",
  "messages",
  "conversations",
  "vehicle_maintenance",
  "bookings",
  "customers",
  "vehicles",
  "locations",
  "vehicle_categories",
  "knowledge_base",
  "quick_replies",
];

async function wipeStorage(db: SupabaseClient) {
  const bucket = db.storage.from("documents");
  const top = await bucket.list("documents", { limit: 1000 });
  for (const folder of top.data ?? []) {
    const files = await bucket.list(`documents/${folder.name}`, {
      limit: 1000,
    });
    const paths = (files.data ?? []).map(
      (f) => `documents/${folder.name}/${f.name}`,
    );
    if (paths.length) await bucket.remove(paths);
  }
}

export async function resetDemo(db: SupabaseClient) {
  const owner = must(
    await db
      .from("staff_users")
      .select("id")
      .eq("email", DEMO_EMAIL)
      .maybeSingle(),
    "staff lookup",
  );
  if (!owner)
    throw new Error(`Demo staff user missing - run "npm run demo:user" first.`);

  // --- wipe ---------------------------------------------------------------
  await wipeStorage(db);
  for (const table of WIPE_ORDER) {
    const { error } = await db.from(table).delete().not("id", "is", null);
    if (error) throw new Error(`wipe ${table}: ${error.message}`);
  }
  must(await db.rpc("demo_restart_sequences"), "restart sequences");

  // --- static data ---------------------------------------------------------
  const locRows = must(
    await db
      .from("locations")
      .insert(
        LOCATIONS.map((l) => ({
          name: l.name,
          is_pickup: true,
          is_dropoff: true,
          opening_hours: l.hours,
          instructions: l.instructions,
          google_maps_url: l.maps,
          extra_fee_rs: l.fee,
          after_hours_allowed: l.afterHours,
          after_hours_fee_rs: l.afterFee,
          active: true,
        })),
      )
      .select("id, name"),
    "locations",
  );
  const locId = Object.fromEntries(
    LOCATIONS.map((l) => [l.key, locRows.find((r) => r.name === l.name)!.id]),
  ) as Record<LocKey, string>;
  const locFee = Object.fromEntries(
    LOCATIONS.map((l) => [l.key, l.fee]),
  ) as Record<LocKey, number>;

  const catRows = must(
    await db.from("vehicle_categories").insert(CATEGORIES).select("id, name"),
    "categories",
  );
  const catId = Object.fromEntries(catRows.map((c) => [c.name, c.id]));

  const day = (n: number) => mu(n, 12).toISOString().slice(0, 10);
  const vehRows = must(
    await db
      .from("vehicles")
      .insert(
        VEHICLES.map((v) => ({
          make: v.make,
          model: v.model,
          category_id: catId[v.cat],
          registration: v.reg,
          transmission: "Automatic",
          seats: v.seats,
          daily_price_rs: v.price,
          home_location_id: locId[v.home],
          current_location_id: locId[v.home],
          status: "ACTIVE",
          photo_url: ph(`${v.make} ${v.model}`),
          photos: [ph(`${v.make} ${v.model}`)],
          mileage: v.mileage,
          last_service_at: day(-45),
          next_service_due: day(60),
          insurance_expiry: day("insuranceDays" in v ? v.insuranceDays : 240),
          inspection_expiry: day(150),
        })),
      )
      .select("id, registration"),
    "vehicles",
  );
  const vehId = Object.fromEntries(
    VEHICLES.map((v) => [
      v.key,
      vehRows.find((r) => r.registration === v.reg)!.id,
    ]),
  ) as Record<VehKey, string>;
  const vehPrice = Object.fromEntries(
    VEHICLES.map((v) => [v.key, v.price]),
  ) as Record<VehKey, number>;

  must(
    await db.from("knowledge_base").insert(
      KNOWLEDGE.map(([topic, question, answer]) => ({
        topic,
        question,
        answer,
        active: true,
      })),
    ),
    "knowledge",
  );
  must(
    await db.from("quick_replies").insert([
      {
        label: "On our way",
        body: "Hello! Our agent is on the way and will be with you shortly.",
      },
      {
        label: "Delay approved",
        body: "Thanks for letting us know - your return time change is approved.",
      },
      {
        label: "Cash reminder",
        body: "A reminder that payment is cash only (Rs), paid when you collect the car.",
      },
    ]),
    "quick replies",
  );

  const custRows = must(
    await db
      .from("customers")
      .insert(
        CUSTOMERS.map((c) => ({
          whatsapp_number: c.phone,
          full_name: c.name,
          email: c.email,
        })),
      )
      .select("id, whatsapp_number"),
    "customers",
  );
  const custId = Object.fromEntries(
    CUSTOMERS.map((c) => [
      c.key,
      custRows.find((r) => r.whatsapp_number === c.phone)!.id,
    ]),
  ) as Record<CustKey, string>;

  // --- bookings -------------------------------------------------------------
  const specs = bookingSpecs();
  const bookingId: Record<string, string> = {};
  for (const s of specs) {
    const days = rentalDays(s.pickup, s.ret);
    const fees =
      locFee[s.pickupLoc] +
      (s.pickupLoc === s.dropoffLoc ? 0 : locFee[s.dropoffLoc]);
    const row = must(
      await db
        .from("bookings")
        .insert({
          customer_id: custId[s.cust],
          vehicle_id: vehId[s.veh],
          pickup_location_id: locId[s.pickupLoc],
          dropoff_location_id: locId[s.dropoffLoc],
          pickup_at: s.pickup.toISOString(),
          return_at: s.ret.toISOString(),
          rental_days: days,
          daily_price_rs: vehPrice[s.veh],
          extras_rs: 0,
          total_rs: days * vehPrice[s.veh] + fees,
          status: s.status,
          document_status: s.docStatus,
          notes: s.notes ?? null,
          upload_token: s.uploadToken ? randomUUID().replace(/-/g, "") : null,
          upload_token_expires_at: s.uploadToken
            ? ahead(72).toISOString()
            : null,
          created_at: ago(s.createdHoursAgo).toISOString(),
        })
        .select("id")
        .single(),
      `booking ${s.key}`,
    );
    bookingId[s.key] = row.id;

    if (s.paid) {
      // Same order the real markAsPaid() uses: payments row first, then PAID.
      const total = days * vehPrice[s.veh] + fees;
      must(
        await db.from("payments").insert({
          booking_id: row.id,
          amount_rs: total,
          method: "CASH",
          marked_paid_by: owner.id,
          marked_paid_at: s.pickup.toISOString(),
        }),
        "payment",
      );
      must(
        await db
          .from("bookings")
          .update({ payment_status: "PAID" })
          .eq("id", row.id),
        "mark paid",
      );
    }
  }

  // --- documents (sample images; clearly fake) --------------------------------
  const customerName = Object.fromEntries(
    CUSTOMERS.map((c) => [c.key, c.name]),
  ) as Record<CustKey, string>;
  for (const s of specs.filter((x) => x.docs)) {
    const needsReview = s.docs === "NEEDS_REVIEW";
    for (const type of ["PASSPORT", "DRIVING_PERMIT"] as const) {
      const name =
        needsReview && type === "DRIVING_PERMIT"
          ? "V. JHURRY"
          : customerName[s.cust];
      const png = await sampleDocImage(
        type === "PASSPORT" ? "SAMPLE PASSPORT" : "SAMPLE DRIVING PERMIT",
        name,
      );
      const path = `documents/${bookingId[s.key]}/${type}-${randomUUID()}.png`;
      const up = await db.storage
        .from("documents")
        .upload(path, png, { contentType: "image/png" });
      if (up.error) throw new Error(`upload: ${up.error.message}`);
      const doc = must(
        await db
          .from("documents")
          .insert({
            booking_id: bookingId[s.key],
            customer_id: custId[s.cust],
            doc_type: type,
            storage_path: path,
            mime_type: "image/png",
            uploaded_at: ago(4).toISOString(),
          })
          .select("id")
          .single(),
        "document",
      );
      must(
        await db.from("document_verifications").insert({
          document_id: doc.id,
          extracted_name: name,
          document_number: "DEMO-000000",
          detected_doc_type: type,
          expiry_date: day(needsReview && type === "DRIVING_PERMIT" ? 4 : 900),
          name_match_score:
            needsReview && type === "DRIVING_PERMIT" ? 0.62 : 0.99,
          confidence: needsReview && type === "DRIVING_PERMIT" ? 0.71 : 0.97,
          result: needsReview ? "NEEDS_REVIEW" : "VERIFIED",
          reasons:
            needsReview && type === "DRIVING_PERMIT"
              ? [
                  "Name on permit (V. JHURRY) does not fully match the booking name",
                  "Permit expires before the return date",
                  "Low image confidence",
                ]
              : needsReview
                ? ["Waiting for the driving permit to be checked"]
                : [],
        }),
        "verification",
      );
    }
  }

  // --- conversations (so booking transcripts aren't empty) ----------------------
  const convo = async (
    cust: CustKey,
    lines: ["customer" | "ai", string][],
    startHoursAgo: number,
  ) => {
    const conv = must(
      await db
        .from("conversations")
        .insert({
          customer_id: custId[cust],
          mode: "AI",
          last_message_at: ago(
            startHoursAgo - lines.length * 0.05,
          ).toISOString(),
        })
        .select("id")
        .single(),
      "conversation",
    );
    must(
      await db.from("messages").insert(
        lines.map(([who, body], i) => ({
          conversation_id: conv.id,
          direction: who === "customer" ? "INBOUND" : "OUTBOUND",
          sender: who,
          body,
          created_at: ago(startHoursAgo - i * 0.05).toISOString(),
        })),
      ),
      "messages",
    );
  };
  await convo(
    "priya",
    [
      ["customer", "Hi, I'd like to rent a Toyota Vitz from the airport"],
      [
        "ai",
        "Hello Priya! The Vitz is Rs 1,400/day. When would you like to pick it up and return it?",
      ],
      ["customer", "Yesterday 10am to tomorrow 10am, airport both ways"],
      [
        "ai",
        "Got it: 2 days at Rs 1,400 plus the Rs 500 airport fee, total Rs 3,300, paid in cash at collection. Shall I confirm?",
      ],
      ["customer", "Yes please"],
      [
        "ai",
        "Booked! Please upload your passport and driving permit via the secure link I sent.",
      ],
    ],
    118,
  );
  await convo(
    "ashvin",
    [
      [
        "customer",
        "Do you have an X-Trail for 5 days from tomorrow at the airport?",
      ],
      [
        "ai",
        "Yes, an X-Trail is available. 5 days at Rs 3,200 plus the Rs 500 airport fee comes to Rs 16,500, cash on collection. Want me to book it?",
      ],
      ["customer", "Yes, name is Ashvin Gungadin"],
      [
        "ai",
        "Your booking is confirmed. Your documents have been verified. See you at the airport!",
      ],
    ],
    38,
  );
  await convo(
    "nadia",
    [
      ["customer", "Bonjour, je voudrais louer une Vitz dans 2 jours"],
      [
        "ai",
        "Bonjour Nadia ! La Vitz coûte Rs 1,400/jour. Jusqu'à quand souhaitez-vous la garder ?",
      ],
      ["customer", "3 jours, aéroport"],
      [
        "ai",
        "3 jours : Rs 4,200 + Rs 500 (frais aéroport) = Rs 4,700, payable en espèces. Je confirme ?",
      ],
      ["customer", "Oui"],
      [
        "ai",
        "C'est réservé ! Merci d'envoyer votre passeport et permis de conduire via le lien sécurisé.",
      ],
    ],
    2.8,
  );
  await convo(
    "vikash",
    [
      [
        "customer",
        "Hi, Swift from Quatre Bornes for 2 days from the day after tomorrow",
      ],
      [
        "ai",
        "The Swift is Rs 1,500/day: 2 days = Rs 3,000, cash at collection. Confirm?",
      ],
      ["customer", "Yes. Vikash Jhurry"],
      [
        "ai",
        "Booked! Please upload your passport and driving permit using the link.",
      ],
      ["customer", "Done, uploaded"],
      ["ai", "Thank you - our team will review your documents shortly."],
    ],
    4.5,
  );

  // --- open owner notifications --------------------------------------------------
  must(
    await db.from("owner_notifications").insert([
      {
        booking_id: bookingId.b_mc_returning,
        type: "DELAY",
        title: "Marie-Claire Beeharry may return 1 hour late",
        body: "Customer says traffic is heavy; expects to return about 1 hour after the agreed time. Request only - not approved.",
        created_at: ago(0.5).toISOString(),
      },
      {
        booking_id: bookingId.b_vikash_review,
        type: "DOC_REVIEW",
        title: "Documents need review: Vikash Jhurry",
        body: "Name mismatch on driving permit; permit expires before return date.",
        created_at: ago(4).toISOString(),
      },
      {
        booking_id: bookingId.b_kevin_out,
        type: "EXTENSION_REQUEST",
        title: "Kevin Ramsamy asks to extend by 2 days",
        body: "Wants to keep the Swift until 2 days later. Availability not yet checked by the team.",
        created_at: ago(1.5).toISOString(),
      },
    ]),
    "notifications",
  );

  return {
    bookings: specs.length,
    vehicles: VEHICLES.length,
    customers: CUSTOMERS.length,
  };
}
