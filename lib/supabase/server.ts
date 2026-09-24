import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

let client: SupabaseClient | undefined;

/**
 * Service-role Supabase client. Bypasses Row Level Security, so it must only
 * run on the server (route handlers, server actions, server components).
 * `server-only` makes any client-side import a build error.
 */
export function getServiceSupabase(): SupabaseClient {
  if (!client) {
    const env = requireEnv(process.env, [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
