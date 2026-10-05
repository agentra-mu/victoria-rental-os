import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { AnalyticsInput } from "./metrics";

export async function loadAnalyticsInput(): Promise<AnalyticsInput> {
  const db = getServiceSupabase();
  const [b, p, e, c, v, m, l, r, cu] = await Promise.all([
    db
      .from("bookings")
      .select(
        "id, customer_id, status, payment_status, created_at, pickup_at, return_at, total_rs, vehicle_id, pickup_location_id, dropoff_location_id",
      ),
    db.from("payments").select("booking_id, amount_rs, marked_paid_at"),
    db
      .from("booking_events")
      .select("booking_id, event_type, new_value, created_at")
      .in("event_type", ["STATUS_CHANGED", "DOCUMENT_STATUS_CHANGED"]),
    db.from("conversations").select("customer_id, mode, taken_over_at"),
    db.from("vehicles").select("id, make, model"),
    db.from("vehicle_maintenance").select("vehicle_id, start_at, end_at"),
    db.from("locations").select("id, name"),
    db.from("booking_change_requests").select("type, created_at"),
    db.from("customers").select("created_at"),
  ]);
  return {
    bookings: b.data ?? [],
    payments: p.data ?? [],
    events: e.data ?? [],
    conversations: c.data ?? [],
    vehicles: v.data ?? [],
    maintenance: m.data ?? [],
    locations: l.data ?? [],
    changeRequests: r.data ?? [],
    customers: cu.data ?? [],
  };
}
