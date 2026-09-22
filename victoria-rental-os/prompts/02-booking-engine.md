# Component 2 — Booking engine

**What it is:** The "brain": availability, pricing, validation and the status flow. The
AI agent calls these functions as tools; the dashboard calls them too. This is the most
important code to get right and test.

**What to build:**

- getAvailableVehicles, calculatePrice (with line items), createBookingDraft,
  updateBookingDraft, confirmBooking, cancelBooking
- A status state machine that rejects illegal transitions
- API routes protected by an internal secret so only n8n and the backend can call them

CANCELLED and NEEDS_HUMAN are reachable from any active status.

## Prompt

```text
Read CLAUDE.md and the schema in /supabase/migrations. Build the booking engine in /lib/domain with route handlers in /app/api/engine.

Functions (pure TypeScript where possible, DB access injected so they're testable):
1. getAvailableVehicles({ pickupAt, returnAt, categoryId?, locationId? }) — returns vehicles with status ACTIVE and no overlapping non-cancelled booking. Group by model for display (e.g. "Toyota Vitz — 3 available") but keep physical vehicle IDs internal.
2. calculateRentalDays(pickupAt, returnAt) — implement as a configurable rule in /lib/domain/config.ts: default is 24-hour blocks rounded up, with a configurable grace period (default 60 min). Make the rule easy to change because the rental company hasn't confirmed it yet.
3. calculatePrice({ vehicleId, pickupAt, returnAt, pickupLocationId, dropoffLocationId }) — returns { rentalDays, dailyPriceRs, baseRs, locationFeesRs, totalRs, lineItems[] }. Prices come only from the database.
4. Booking state machine in /lib/domain/bookingStatus.ts — explicit allowed transitions map; any other transition throws. NEEDS_HUMAN and CANCELLED reachable from any active state.
5. createBookingDraft(customerId), updateBookingDraft(bookingId, partialFields) — validates dates (pickup in future, return after pickup, minimum rental period from config), locations exist and allow pickup/dropoff, vehicle available. Re-checks availability at every step.
6. confirmBooking(bookingId) — final availability re-check inside a transaction (rely on the DB exclusion constraint and catch its error cleanly), moves to PENDING_DOCUMENTS, generates upload_token with 72h expiry.
7. cancelBooking(bookingId, actor, reason).

Route handlers under /app/api/engine/* that wrap these, require header x-internal-secret = INTERNAL_API_SECRET, validate input with zod, and return consistent JSON { ok, data | error: { code, message } }. Error codes should be machine-readable (VEHICLE_UNAVAILABLE, INVALID_DATES, BELOW_MINIMUM_RENTAL, ILLEGAL_TRANSITION) so the AI can explain them to customers.

Write thorough Vitest tests: overlapping bookings, back-to-back bookings (return 10:00, next pickup 10:00 same car = allowed), timezone edge cases around midnight Mauritius time, grace period, illegal transitions, and concurrent confirmation of the same vehicle.
```
