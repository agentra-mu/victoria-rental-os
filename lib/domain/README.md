# lib/domain

Pure, unit-tested business logic: pricing, availability, booking validation,
status transitions, vehicle assignment. No I/O here — no Supabase, no fetch,
no `process.env`. Route handlers in `app/api` load data, call these functions,
and persist the result.
