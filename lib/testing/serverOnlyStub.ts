// Vitest stand-in for the "server-only" package (aliased in vitest.config.mts).
// The real package throws outside Next.js's server build, which breaks
// importing server-side modules directly in tests — Vitest already only
// runs server-side code, so the guard has nothing to do here.
export {};
