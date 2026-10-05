import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import path from "node:path";

/**
 * Pilot happy path: simulated WhatsApp message → booking → customer uploads
 * documents → verification lands in NEEDS_REVIEW → owner approves → marks paid.
 *
 * Required env (staging only!): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * INTERNAL_API_SECRET, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD. The app must run
 * against the same Supabase project. WhatsApp sends are expected to fail
 * harmlessly without Meta credentials (the dashboard actions still succeed
 * only if WHATSAPP_* are set — run with a Meta test number or stub).
 */
const phone = `+2305${Math.floor(1000000 + Math.random() * 8999999)}`;

test("owner login → simulated chat → document upload → approve → mark paid", async ({
  page,
  request,
}) => {
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 1. Simulated WhatsApp conversation (deterministic: the "human" keyword needs no LLM).
  const inbound = await request.post("/api/whatsapp/inbound", {
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET! },
    data: {
      from: phone.replace("+", ""),
      messageId: `e2e-${Date.now()}`,
      timestamp: "0",
      type: "text",
      text: "Hello, I'd like to rent a car",
    },
  });
  expect(inbound.ok()).toBeTruthy();
  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("whatsapp_number", phone)
    .single();
  expect(customer).toBeTruthy();
  await db
    .from("customers")
    .update({ full_name: "E2E Tester" })
    .eq("id", customer!.id);

  // 2. A booking waiting for documents (what the agent's confirm_booking leaves behind).
  const { data: vehicle } = await db
    .from("vehicles")
    .select("id, daily_price_rs")
    .eq("status", "ACTIVE")
    .limit(1)
    .single();
  const { data: loc } = await db
    .from("locations")
    .select("id")
    .eq("active", true)
    .limit(1)
    .single();
  const pickup = new Date(Date.now() + 40 * 86400_000);
  const ret = new Date(pickup.getTime() + 3 * 86400_000);
  const token = `e2e${Date.now()}`;
  const { data: booking, error } = await db
    .from("bookings")
    .insert({
      customer_id: customer!.id,
      vehicle_id: vehicle!.id,
      pickup_location_id: loc!.id,
      dropoff_location_id: loc!.id,
      pickup_at: pickup.toISOString(),
      return_at: ret.toISOString(),
      rental_days: 3,
      daily_price_rs: vehicle!.daily_price_rs,
      total_rs: vehicle!.daily_price_rs * 3,
      status: "PENDING_DOCUMENTS",
      upload_token: token,
      upload_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    })
    .select("id, booking_number")
    .single();
  expect(error).toBeNull();

  // 3. Customer uploads both documents on the public page.
  await page.goto(`/documents/${token}`);
  const sample = path.join(__dirname, "fixtures", "sample.jpg");
  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(sample);
  await inputs.nth(1).setInputFiles(sample);
  // Each slot uploads as soon as a file is chosen; both done → confirmation panel.
  await expect(page.getByText(/we're checking your documents/i)).toBeVisible();

  // 4. Verification stub → NEEDS_REVIEW (never auto-verified).
  await expect
    .poll(
      async () =>
        (
          await db
            .from("bookings")
            .select("document_status")
            .eq("id", booking!.id)
            .single()
        ).data?.document_status,
    )
    .toBe("NEEDS_REVIEW");

  // 5. Owner signs in, opens the booking, approves, marks paid.
  await page.goto("/dashboard/login");
  await page.getByPlaceholder("Email").fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByPlaceholder("Password").fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");

  await page.goto(`/dashboard/bookings/${booking!.id}`);
  await expect(
    page.getByText(`Booking #${booking!.booking_number}`),
  ).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect
    .poll(
      async () =>
        (
          await db
            .from("bookings")
            .select("document_status")
            .eq("id", booking!.id)
            .single()
        ).data?.document_status,
    )
    .toBe("VERIFIED");

  await page.getByRole("button", { name: "Mark as Paid" }).click();
  await expect
    .poll(
      async () =>
        (
          await db
            .from("bookings")
            .select("payment_status")
            .eq("id", booking!.id)
            .single()
        ).data?.payment_status,
    )
    .toBe("PAID");

  // Cleanup so reruns stay tidy.
  await db.from("payments").delete().eq("booking_id", booking!.id);
});
