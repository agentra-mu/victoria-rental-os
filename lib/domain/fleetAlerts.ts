import type { SupabaseClient } from "@supabase/supabase-js";

export const ALERT_DAYS = 14;

export interface VehicleDates {
  insurance_expiry: string | null;
  inspection_expiry: string | null;
  next_service_due: string | null;
}

/** Which alerts apply to a vehicle `today` (YYYY-MM-DD): expiring within 14 days, expired, or service due. */
export function vehicleAlerts(v: VehicleDates, today: string): string[] {
  const horizon = new Date(Date.parse(today) + ALERT_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);
  const out: string[] = [];
  const check = (date: string | null, label: string) => {
    if (!date) return;
    if (date < today) out.push(`${label} EXPIRED (${date})`);
    else if (date <= horizon) out.push(`${label} expires ${date}`);
  };
  check(v.insurance_expiry, "Insurance");
  check(v.inspection_expiry, "Inspection");
  if (v.next_service_due && v.next_service_due <= today)
    out.push(`Service due (${v.next_service_due})`);
  return out;
}

/** Raises one owner notification per vehicle when its alert set changes (tracked in last_alert_key). */
export async function fleetAlertsDue(
  client: SupabaseClient,
  now: Date,
): Promise<number> {
  const today = now.toISOString().slice(0, 10);
  const { data } = await client
    .from("vehicles")
    .select(
      "id, vehicle_code, make, model, insurance_expiry, inspection_expiry, next_service_due, last_alert_key",
    )
    .neq("status", "RETIRED");
  let raised = 0;
  for (const v of data ?? []) {
    const alerts = vehicleAlerts(v, today);
    const key = alerts.join("|");
    if (alerts.length === 0 || key === v.last_alert_key) continue;
    await client.from("owner_notifications").insert({
      type: "ALERT",
      title: `${v.vehicle_code} ${v.make} ${v.model}: ${alerts.join("; ")}`,
    });
    await client
      .from("vehicles")
      .update({ last_alert_key: key })
      .eq("id", v.id);
    raised += 1;
  }
  return raised;
}
