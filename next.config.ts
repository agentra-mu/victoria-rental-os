import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose only the public Supabase values to the browser bundle. The service
  // role key and all other secrets stay server-side.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  },
};

export default nextConfig;
