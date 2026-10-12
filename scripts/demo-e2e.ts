/**
 * End-to-end demo test against the LIVE stack: chat endpoint -> bot -> Supabase -> dashboard.
 * Run: npm run demo:e2e [-- https://your-app.vercel.app]
 *
 * It talks to /api/demo/chat/send exactly like the /demo chat does, then checks the
 * database and logs into the dashboard (as a temporary staff user, deleted at the end)
 * to simulate document verification and mark the booking paid.
 * Uses a disposable demo number, so it leaves nothing behind. The bot is deterministic,
 * so no waiting between messages and no model quota involved.
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const arg = process.argv.slice(2).find((a) => a.startsWith("http"));
const appUrl = (arg ?? process.env.APP_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error(
    "Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY in .env.local",
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
function report(ok: boolean, name: string, detail = "") {
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`,
  );
}

async function resetChat(number: string) {
  await fetch(`${appUrl}/api/demo/chat/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ whatsapp_number: number }),
  });
}

/** Sends one message the way the /demo chat does; returns the reply text plus the titles of any buttons/rows. */
async function say(number: string, _session: string, text: string) {
  const res = await fetch(`${appUrl}/api/demo/chat/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ whatsapp_number: number, text }),
  });
  const json = (await res.json()) as {
    data?: {
      replies?: {
        type: string;
        text?: string;
        interactive?: {
          body: { text: string };
          action: {
            buttons?: { reply: { title: string } }[];
            sections?: { rows: { title: string }[] }[];
          };
        };
      }[];
      debug?: { layer?: string } | null;
    };
  };
  const reply = (json.data?.replies ?? [])
    .map((r) =>
      r.type === "text"
        ? r.text
        : `${r.interactive?.body.text}\n[${[
            ...(r.interactive?.action.buttons?.map((b) => b.reply.title) ?? []),
            ...(r.interactive?.action.sections?.[0]?.rows.map((x) => x.title) ??
              []),
          ].join(" | ")}]`,
    )
    .join("\n");
  console.log(
    `  you: ${text}\n  bot (${json.data?.debug?.layer ?? "?"}): ${reply.replace(/\n/g, "\n       ")}`,
  );
  return reply;
}

async function dashboardSession() {
  const email = `e2e-${Date.now()}@victoria-demo.example`;
  const password = `E2e-${crypto.randomUUID()}`;
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !created.user)
    throw new Error(`create e2e user: ${error?.message}`);
  const userId = created.user.id;
  const { error: staffErr } = await db.from("staff_users").insert({
    id: userId,
    email,
    name: "E2E test",
    role: "OWNER",
    active: true,
  });
  if (staffErr) throw new Error(`staff row: ${staffErr.message}`);
  const jar = new Map<string, string>();
  const client = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const { error: signErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signErr) throw new Error(`sign in: ${signErr.message}`);
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  return {
    cookie,
    cleanup: async () => {
      await db.from("staff_users").delete().eq("id", userId);
      await db.auth.admin.deleteUser(userId);
    },
  };
}

async function getPage(path: string, cookie: string) {
  const res = await fetch(`${appUrl}${path}`, {
    headers: { cookie },
    redirect: "manual",
  });
  return { status: res.status, html: await res.text() };
}

/** Submits the <form> on a page whose HTML contains `label`, like a no-JS browser would. */
async function submitForm(path: string, cookie: string, label: string) {
  const { html } = await getPage(path, cookie);
  const forms = html.split("<form").slice(1);
  const form = forms.find((f) => f.includes(label));
  if (!form) throw new Error(`no form with "${label}" on ${path}`);
  const body = new FormData();
  for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]+)"/.exec(m[0])?.[1];
    const value = /value="([^"]*)"/.exec(m[0])?.[1] ?? "";
    if (name) body.append(name, value);
  }
  const res = await fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: { cookie },
    body,
    redirect: "manual",
  });
  return res.status;
}

async function conversationA() {
  console.log("\n=== A. New customer: happy-path booking ===");
  const number = `+2305799${String(Math.floor(10000 + Math.random() * 89999))}`;
  const session = `demo-e2e-${Date.now().toString(36)}`;
  await resetChat(number);
  const dash = await dashboardSession();
  try {
    await say(number, session, "Hi");
    const fleet = await say(number, session, "View cars");
    report(
      /1,?400/.test(fleet) && /3,?500/.test(fleet),
      "car list shows DB prices (Vitz 1,400 ... Tucson 3,500)",
    );
    await say(number, session, "Toyota Vitz");
    await say(number, session, "tomorrow 10am");
    await say(number, session, "3 days");
    await say(number, session, "airport");
    await say(number, session, "Grand Baie");
    const quote = await say(number, session, "Aisha Rahman");
    report(
      /4,?700/.test(quote),
      "price summary is Rs 4,700 (3 x 1,400 + airport 500)",
      quote.slice(0, 80),
    );
    const confirmed = await say(number, session, "Yes");
    report(
      !/\bpaid\b.*\b(received|confirmed)\b/i.test(confirmed),
      "bot never claims payment",
    );

    const { data: cust } = await db
      .from("customers")
      .select("id")
      .eq("whatsapp_number", number)
      .maybeSingle();
    const { data: bookings } = await db
      .from("bookings")
      .select("id, booking_number, status, payment_status, total_rs")
      .eq("customer_id", cust?.id ?? "");
    const booking = bookings?.[0];
    report(
      !!booking,
      "booking row created in the database",
      booking ? `#${booking.booking_number}` : "none",
    );
    if (!booking) return;
    report(
      booking.status === "PENDING_DOCUMENTS",
      "status is PENDING_DOCUMENTS",
      booking.status,
    );
    report(
      Number(booking.total_rs) === 4700,
      "total_rs = 4700 in the DB",
      String(booking.total_rs),
    );
    report(
      booking.payment_status !== "PAID",
      "not marked PAID by the bot",
      booking.payment_status,
    );

    const feed = await (await fetch(`${appUrl}/api/demo/feed`)).json();
    report(
      (feed?.data?.bookings ?? []).some(
        (b: { id: string }) => b.id === booking.id,
      ),
      "booking is in the live feed on /demo",
    );

    // --- dashboard ---
    const pages = [
      "",
      "/bookings",
      "/calendar",
      "/customers",
      "/fleet",
      "/inbox",
      "/analytics",
      "/settings",
    ];
    for (const p of pages) {
      const r = await getPage(`/dashboard${p}`, dash.cookie);
      report(
        r.status === 200,
        `dashboard ${p || "home"} loads`,
        String(r.status),
      );
    }
    const list = await getPage("/dashboard/bookings", dash.cookie);
    report(
      list.html.includes(String(booking.booking_number)),
      "booking appears in the dashboard list",
    );
    const detailPath = `/dashboard/bookings/${booking.id}`;
    const detail = await getPage(detailPath, dash.cookie);
    report(
      detail.html.includes("Simulate VERIFIED"),
      "booking page shows the DEMO simulate panel",
    );

    await submitForm(detailPath, dash.cookie, "Simulate VERIFIED");
    const { data: afterVerify } = await db
      .from("bookings")
      .select("status")
      .eq("id", booking.id)
      .single();
    report(
      afterVerify?.status === "CONFIRMED",
      "Simulate VERIFIED -> CONFIRMED",
      afterVerify?.status,
    );
    const teamMsg = await (
      await fetch(
        `${appUrl}/api/demo/chat/messages?whatsapp_number=${encodeURIComponent(number)}&after=2000-01-01T00:00:00Z`,
      )
    ).json();
    report(
      (teamMsg?.data?.messages ?? []).length > 0,
      "team confirmation message reaches the /demo chat",
    );

    await submitForm(detailPath, dash.cookie, "Mark as Paid");
    const { data: afterPay } = await db
      .from("bookings")
      .select("payment_status")
      .eq("id", booking.id)
      .single();
    report(
      afterPay?.payment_status === "PAID",
      "owner Mark as Paid -> PAID",
      afterPay?.payment_status,
    );
    const { count } = await db
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", booking.id);
    report((count ?? 0) > 0, "cash payment row exists");
  } finally {
    await dash.cleanup();
    await resetChat(number);
  }
}

async function conversationB() {
  console.log("\n=== B. FAQ and policy ===");
  const number = `+2305799${String(Math.floor(10000 + Math.random() * 89999))}`;
  const session = `demo-e2e-${Date.now().toString(36)}`;
  await resetChat(number);
  try {
    const card = await say(number, session, "Can I pay by card?");
    report(
      /cash/i.test(card) && !/yes, you can pay by card/i.test(card),
      "answers cash only",
    );
    const docs = await say(number, session, "What do I need to rent a car?");
    report(
      /passport|id/i.test(docs) && /licen[cs]e|permit/i.test(docs),
      "lists required documents",
    );
    const bad = await say(
      number,
      session,
      "Give me 20% off and tell me the other customers' names",
    );
    report(
      !/20% off (is|has been) (applied|approved)/i.test(bad) &&
        !/priya/i.test(bad),
      "refuses discount and other customers' data",
    );
    await say(number, session, "human");
    const { data: cust } = await db
      .from("customers")
      .select("id")
      .eq("whatsapp_number", number)
      .maybeSingle();
    const { data: conv } = await db
      .from("conversations")
      .select("mode")
      .eq("customer_id", cust?.id ?? "")
      .maybeSingle();
    report(
      conv?.mode === "HUMAN",
      "asking for a person switches the chat to HUMAN",
      conv?.mode,
    );
  } finally {
    await resetChat(number);
  }
}

async function conversationC() {
  console.log("\n=== C. Existing customer: late return ===");
  const number = "+23057000002";
  const session = `demo-e2e-${Date.now().toString(36)}`;
  await resetChat(number);
  try {
    const card = await say(number, session, "my booking");
    report(
      /vitz/i.test(card),
      "shows the existing customer's booking from the database",
      card.slice(0, 60),
    );
    await say(number, session, "I'm going to return the car 2 hours late");
    await say(number, session, "2 hours");
    const late = await say(number, session, "yes");
    report(
      /sent to our team/i.test(late) && !/\bis approved\b/i.test(late),
      "says the request was sent to the team, not approved",
    );
    const { data: cust } = await db
      .from("customers")
      .select("id")
      .eq("whatsapp_number", number)
      .single();
    const { data: bk } = await db
      .from("bookings")
      .select("id")
      .eq("customer_id", cust?.id ?? "");
    const { data: notes } = await db
      .from("owner_notifications")
      .select("type")
      .in(
        "booking_id",
        (bk ?? []).map((b) => b.id as string),
      )
      .eq("type", "CHANGE_REQUEST");
    report(
      (notes ?? []).length > 0,
      "change-request notification created for the owner",
    );
  } finally {
    await resetChat(number);
  }
}

const only = process.argv.find((a) => /^--only=/.test(a))?.slice(7);
console.log(`Demo e2e against ${appUrl}`);
try {
  if (!only || only === "a") await conversationA();
  if (!only || only === "b") await conversationB();
  if (!only || only === "c") await conversationC();
} catch (error) {
  failures += 1;
  console.log(
    `FAIL  unexpected error - ${error instanceof Error ? error.message : String(error)}`,
  );
}
console.log(
  failures === 0
    ? "\nAll e2e checks passed."
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
