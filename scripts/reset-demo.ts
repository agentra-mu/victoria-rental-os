/** Wipes bookings/messages/notifications/documents (and fleet/knowledge) and re-seeds the demo. Run: npm run demo:reset */
import { createClient } from "@supabase/supabase-js";
import { PERSONAS, resetDemo } from "./lib/demoSeed.ts";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const started = Date.now();
const counts = await resetDemo(db);
console.log(
  `Demo reset in ${((Date.now() - started) / 1000).toFixed(1)}s: ${counts.vehicles} vehicles, ${counts.customers} customers, ${counts.bookings} bookings.`,
);
console.log(
  `Personas: new customer ${PERSONAS.newCustomer} | existing customer ${PERSONAS.existingCustomer}`,
);
