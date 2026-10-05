import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, requireAction, requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  btn,
  btnPrimary,
  fmtDate,
  fmtDateTime,
  input,
} from "../../../_components/ui";

export const dynamic = "force-dynamic";

export default async function VehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff("fleet");
  const { id } = await params;
  const db = getServiceSupabase();
  const { data: v } = await db
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .single();
  if (!v) notFound();
  const [{ data: bookings }, { data: maint }] = await Promise.all([
    db
      .from("bookings")
      .select("id, booking_number, status, pickup_at, return_at")
      .eq("vehicle_id", id)
      .order("pickup_at", { ascending: false })
      .limit(30),
    db
      .from("vehicle_maintenance")
      .select("id, start_at, end_at, reason")
      .eq("vehicle_id", id)
      .order("start_at", { ascending: false }),
  ]);

  async function save(fd: FormData) {
    "use server";
    const staff = await requireAction("fleet");
    const d = (k: string) => String(fd.get(k) || "") || null;
    await getServiceSupabase()
      .from("vehicles")
      .update({
        status: String(fd.get("status")),
        daily_price_rs: Number(fd.get("daily_price_rs")),
        mileage: Number(fd.get("mileage")) || 0,
        last_service_at: d("last_service_at"),
        next_service_due: d("next_service_due"),
        insurance_expiry: d("insurance_expiry"),
        inspection_expiry: d("inspection_expiry"),
        notes: d("notes"),
        photo_url: d("photo_url"),
      })
      .eq("id", id);
    await audit(staff, "vehicle.update", "vehicle", id);
    revalidatePath(`/dashboard/fleet/${id}`);
  }
  async function addMaintenance(fd: FormData) {
    "use server";
    const staff = await requireAction("fleet");
    const { error } = await getServiceSupabase()
      .from("vehicle_maintenance")
      .insert({
        vehicle_id: id,
        start_at: new Date(`${fd.get("start")}T00:00:00+04:00`).toISOString(),
        end_at: new Date(`${fd.get("end")}T23:59:59+04:00`).toISOString(),
        reason: String(fd.get("reason") || "") || null,
      });
    if (error) throw new Error(error.message);
    await audit(staff, "vehicle.maintenance", "vehicle", id);
    revalidatePath(`/dashboard/fleet/${id}`);
  }

  return (
    <>
      <Link href="/dashboard/fleet" className="text-sm underline">
        ← Fleet
      </Link>
      <h1 className="my-3 text-xl font-semibold">
        {v.vehicle_code} · {v.make} {v.model} · {v.registration}{" "}
        <Badge value={v.status} />
      </h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Details & document expiries">
          <form action={save} className="grid grid-cols-2 gap-2 text-sm">
            <label>
              Status
              <select name="status" defaultValue={v.status} className={input}>
                <option>ACTIVE</option>
                <option>MAINTENANCE</option>
                <option>RETIRED</option>
              </select>
            </label>
            <label>
              Rs / day
              <input
                name="daily_price_rs"
                type="number"
                defaultValue={v.daily_price_rs}
                className={input}
              />
            </label>
            <label>
              Mileage (km)
              <input
                name="mileage"
                type="number"
                defaultValue={v.mileage}
                className={input}
              />
            </label>
            <label>
              Photo URL
              <input
                name="photo_url"
                defaultValue={v.photo_url ?? ""}
                className={input}
              />
            </label>
            <label>
              Last service
              <input
                name="last_service_at"
                type="date"
                defaultValue={v.last_service_at ?? ""}
                className={input}
              />
            </label>
            <label>
              Next service due
              <input
                name="next_service_due"
                type="date"
                defaultValue={v.next_service_due ?? ""}
                className={input}
              />
            </label>
            <label>
              Insurance expiry
              <input
                name="insurance_expiry"
                type="date"
                defaultValue={v.insurance_expiry ?? ""}
                className={input}
              />
            </label>
            <label>
              Inspection / fitness expiry
              <input
                name="inspection_expiry"
                type="date"
                defaultValue={v.inspection_expiry ?? ""}
                className={input}
              />
            </label>
            <label className="col-span-2">
              Notes
              <textarea
                name="notes"
                defaultValue={v.notes ?? ""}
                rows={2}
                className={input}
              />
            </label>
            <button className={`${btnPrimary} col-span-2`}>Save</button>
          </form>
        </Card>
        <div>
          <Card title="Maintenance log (blocks availability)">
            <ul className="mb-2 text-sm">
              {(maint ?? []).map((m) => (
                <li key={m.id} className="border-b py-1">
                  {fmtDate(m.start_at)} → {fmtDate(m.end_at)} ·{" "}
                  {m.reason ?? "—"}
                </li>
              ))}
            </ul>
            <form action={addMaintenance} className="grid grid-cols-2 gap-2">
              <input type="date" name="start" required className={input} />
              <input type="date" name="end" required className={input} />
              <input
                name="reason"
                placeholder="Reason"
                className={`${input} col-span-2`}
              />
              <button className={`${btn} col-span-2`}>
                Add maintenance block
              </button>
            </form>
          </Card>
          <Card title="Booking timeline">
            <ul className="text-sm">
              {(bookings ?? []).map((b) => (
                <li key={b.id} className="border-b py-1">
                  <Link
                    className="underline"
                    href={`/dashboard/bookings/${b.id}`}
                  >
                    #{b.booking_number}
                  </Link>{" "}
                  · {fmtDateTime(b.pickup_at)} → {fmtDateTime(b.return_at)} ·{" "}
                  <Badge value={b.status} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
