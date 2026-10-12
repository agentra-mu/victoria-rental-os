/**
 * Smoke test for the demo. Run: npm run demo:check [-- https://your-app.vercel.app]
 * Checks Supabase, seed data, demo user, the /demo page, and that the chat
 * endpoint (the deterministic bot — no LLM, no n8n) answers. Prints PASS/FAIL.
 */
import { createClient } from "@supabase/supabase-js";

const DEMO_EMAIL = "demo@victoria-demo.example";
const arg = process.argv.slice(2).find((a) => a.startsWith("http"));
const appUrl = (arg ?? process.env.APP_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

let failures = 0;
async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    console.log(`PASS  ${name}${detail ? ` - ${detail}` : ""}`);
  } catch (error) {
    failures += 1;
    console.log(
      `FAIL  ${name} - ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

async function count(table: string) {
  if (!db) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  const { count: n, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

console.log(`Checking app at ${appUrl}\n`);

await check("Supabase reachable", async () => {
  await count("vehicles");
  return url ?? "";
});

await check("Seed data present", async () => {
  const need: [string, number][] = [
    ["vehicles", 12],
    ["locations", 6],
    ["customers", 8],
    ["bookings", 12],
    ["knowledge_base", 15],
  ];
  const parts: string[] = [];
  for (const [table, min] of need) {
    const n = await count(table);
    if (n < min)
      throw new Error(
        `${table} has ${n}, expected at least ${min} - run "npm run demo:reset"`,
      );
    parts.push(`${n} ${table}`);
  }
  return parts.join(", ");
});

await check("Demo staff user exists (OWNER)", async () => {
  if (!db) throw new Error("no database client");
  const { data } = await db
    .from("staff_users")
    .select("id, role, active")
    .eq("email", DEMO_EMAIL)
    .maybeSingle();
  if (!data)
    throw new Error(
      `no staff_users row for ${DEMO_EMAIL} - run "npm run demo:user"`,
    );
  if (data.role !== "OWNER" || !data.active)
    throw new Error("demo user is not an active OWNER");
  const { data: auth, error } = await db.auth.admin.getUserById(data.id);
  if (error || !auth.user)
    throw new Error("staff row has no Supabase Auth user");
  return DEMO_EMAIL;
});

await check("/demo page loads", async () => {
  const res = await fetch(`${appUrl}/demo`);
  if (!res.ok) throw new Error(`HTTP ${res.status} (DEMO_MODE must be true)`);
  return "";
});

await check("chat endpoint answers (menu, no LLM)", async () => {
  const res = await fetch(`${appUrl}/api/demo/chat/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ whatsapp_number: "+23057000001", text: "menu" }),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    data?: { replies?: unknown[]; debug?: { layer?: string } | null };
  };
  if (!res.ok || !body.ok || !body.data?.replies?.length)
    throw new Error(`HTTP ${res.status} (DEMO_MODE must be true on the app)`);
  return `answered by the "${body.data.debug?.layer ?? "?"}" layer`;
});

console.log(
  failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
