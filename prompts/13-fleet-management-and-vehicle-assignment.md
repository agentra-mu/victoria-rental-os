# Component 13 — Fleet management and vehicle assignment

**What it is:** Several physical cars of the same model, each with its own registration,
location, maintenance and assignment to bookings.

## Prompt

```text
Read CLAUDE.md and the existing schema/domain code. Extend for full fleet management.

1. Vehicles: add mileage, current_location_id, last_service_at, next_service_due, insurance_expiry, inspection_expiry (the roadworthiness/fitness certificate — keep the field name generic), notes, photos.
2. vehicle_maintenance table: vehicle_id, start_at, end_at, reason. Maintenance blocks availability exactly like a booking (extend the availability function and add maintenance to the overlap check).
3. Customers book a model/category; assignVehicle(bookingId) picks a specific physical vehicle at confirmation using a strategy: prefer a car already at the pickup location, then least-recently-used, then fewest km. Strategy must be swappable.
4. Reassignment: owner can reassign a booking to another available vehicle from the booking page; engine validates no conflict.
5. Alerts: owner notifications 14 days before insurance/inspection expiry and when service is due; block assignment of vehicles with expired insurance/inspection.
6. Fleet pages in the dashboard: vehicle detail with its booking timeline, maintenance log, and document expiries.
Tests for assignment strategy, maintenance blocking, and reassignment conflicts.
```
