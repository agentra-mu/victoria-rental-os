/**
 * Environment variable parsing. Pure functions so they can be unit-tested;
 * callers pass `process.env` in.
 */

type Source = Record<string, string | undefined>;

export const SERVER_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "OWNER_WHATSAPP_NUMBER",
  "INTERNAL_API_SECRET",
  "APP_URL",
] as const;

export type ServerEnvKey = (typeof SERVER_ENV_KEYS)[number];

/** Returns the requested keys, throwing one error that lists every missing key. */
export function requireEnv<K extends string>(
  source: Source,
  keys: readonly K[],
): Record<K, string> {
  const missing = keys.filter((key) => !source[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
  return Object.fromEntries(
    keys.map((key) => [key, source[key]!.trim()]),
  ) as Record<K, string>;
}
