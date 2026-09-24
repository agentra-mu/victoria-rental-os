# Component 10 — Owner dashboard

**What it is:** A functional web app, usable on a phone. It shows today's and upcoming
bookings, booking details, customers, fleet, documents, payment and status, and
notifications. The two key actions are Mark as Paid and document review.

## Prompt

```text
Read CLAUDE.md and the schema. Build the owner dashboard in Next.js with Supabase Auth (email + password, staff_users only; anyone else is signed out). Functional and clean, not elaborate — Tailwind, server components, mobile-usable because the owner will often check it on a phone.

Pages:
1. /dashboard — stat cards (Today's pickups, Today's returns, Upcoming bookings, Cars available today, Cars out), open notifications list (newest first, with Resolve button), upcoming bookings list: booking #, customer, car, dates, pickup → drop-off, total, payment badge, documents badge, status badge.
2. /dashboard/bookings — filterable table (status, date range, payment, documents), search by name/phone/booking #.
3. /dashboard/bookings/[id] — full booking page: customer, vehicle + registration, rental dates + days, locations, price breakdown, payment (Mark as Paid button with confirm dialog), documents section, status with allowed next-status actions only (from the state machine), notes (editable), event history timeline from booking_events, and the conversation transcript.
4. Documents section: shows verification results (each check with a tick or warning and reasons). "View" opens the file via a signed URL valid for 60 seconds generated server-side; every view writes an audit entry (who, when, which document). Buttons: Approve (→ VERIFIED), Request re-upload (sends new link via WhatsApp), Reject (OWNER only, reason required, notifies customer politely and sets NEEDS_HUMAN).
5. /dashboard/customers and /dashboard/customers/[id] — details and booking history.
6. /dashboard/fleet — vehicle list, add/edit vehicle, set MAINTENANCE.
7. /dashboard/settings/knowledge — CRUD for knowledge base entries; /dashboard/settings/locations — CRUD for locations.
Use Supabase realtime to refresh notifications and the bookings list live. All mutations go through server actions that call /lib/domain functions — never write to tables directly from UI code.
```
