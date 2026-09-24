"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/**
 * Browser Supabase client using the anon key (subject to Row Level Security).
 * NEXT_PUBLIC_* values are mapped from SUPABASE_URL / SUPABASE_ANON_KEY in
 * next.config.ts and inlined at build time.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error(
        "Missing SUPABASE_URL or SUPABASE_ANON_KEY at build time",
      );
    }
    client = createBrowserClient(url, anonKey);
  }
  return client;
}
