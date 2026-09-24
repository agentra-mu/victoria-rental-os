# Component 14 — Locations management and fleet calendar

**What it is:** Locations with opening hours, instructions, map links and fees that the
engine enforces, plus a vehicle-by-day calendar that shows fleet utilisation at a glance.

## Prompt

```text
Read CLAUDE.md. Build (1) full locations management and (2) a fleet calendar.

Locations: extend the locations admin with opening hours per weekday, pickup/drop-off flags, instructions sent to the customer (e.g. airport meeting point), Google Maps link, extra fee, and whether after-hours pickup is allowed (with fee). The booking engine must validate pickup/return times against opening hours and apply fees in calculatePrice. The agent should share location instructions in the confirmation message.

Calendar: /dashboard/calendar — a Gantt-style view with vehicles as rows and days as columns (week and month views), bars coloured by booking status, maintenance blocks shown hatched, today highlighted. Click a bar to open the booking. Drag to reassign a booking to another vehicle row (validated through the engine, with a confirm dialog). Show utilisation % per vehicle for the visible range. Must work acceptably on a tablet. Build it with plain React + CSS grid unless a library is clearly better — justify any dependency.
```
