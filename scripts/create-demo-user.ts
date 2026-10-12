/**
 * Creates (or re-keys) the single demo dashboard login: a Supabase Auth user
 * plus the matching staff_users row with role OWNER. Prints the credentials
 * once — nothing is written to disk. Run: npm run demo:user
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEMO_EMAIL = "demo@victoria-demo.example";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const password = randomBytes(9).toString("base64url");

const { data: staff } = await admin
  .from("staff_users")
  .select("id")
  .eq("email", DEMO_EMAIL)
  .maybeSingle();

let userId: string;
if (staff) {
  userId = staff.id;
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw error;
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  userId = data.user.id;
}

const { error: upsertError } = await admin.from("staff_users").upsert({
  id: userId,
  name: "Demo Owner",
  email: DEMO_EMAIL,
  role: "OWNER",
  active: true,
});
if (upsertError) throw upsertError;

console.log("\nDemo dashboard login (shown once — not stored anywhere):");
console.log(`  email:    ${DEMO_EMAIL}`);
console.log(`  password: ${password}\n`);
