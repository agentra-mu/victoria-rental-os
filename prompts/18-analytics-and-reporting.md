# Component 18 — Analytics and reporting

**What it is:** Revenue, bookings, fleet utilisation, location demand and operations
metrics. The headline metric is the share of bookings completed without human
intervention.

## Prompt

```text
Read CLAUDE.md and the schema. Build /dashboard/analytics.

Metrics for a selectable period (default this month, compare to previous):
- Bookings: created, confirmed, completed, cancelled, active; conversion funnel from first WhatsApp enquiry → booking draft → confirmed → completed (use booking_events and conversations).
- Revenue: gross rental value (confirmed + completed), cash collected (payments), outstanding unpaid; by vehicle model and by location.
- Fleet utilisation per vehicle and per model: booked days / available days (excluding maintenance).
- Locations: bookings by pickup and drop-off location.
- Operations: average AI-handled vs human-handled conversations, % of bookings completed without human intervention (the headline metric for this product), average time to document verification, count of delays and extensions.
Implement the metrics as SQL views or Postgres functions (tested against the seed data with known expected values), render with a lightweight chart library, and add CSV export per table. Mobile-friendly.
```
