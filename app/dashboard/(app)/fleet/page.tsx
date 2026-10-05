import Link from "next/link";
import { revalidatePath } from "next/cache";
import { audit, requireAction, requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  btn,
  btnPrimary,
  fmtDate,
  input,
} from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function Fleet() {
  await requireStaff("fleet");
  const db = getServiceSupabase();
  const [{ data: vehicles }, { data: categories }, { data: locations }] =
    await Promise.all([
      db
        .from("vehicles")
        .select(
          "id, vehicle_code, make, model, registration, status, daily_price_rs, mileage, insurance_expiry, inspection_expiry, next_service_due",
        )
        .order("vehicle_code"),
      db.from("vehicle_categories").select("id, name"),
      db.from("locations").select("id, name").eq("active", true),
    ]);

  async function addVehicle(fd: FormData) {
    "use server";
    const staff = await requireAction("fleet");
    const { error } = await getServiceSupabase()
      .from("vehicles")
      .insert({
        make: String(fd.get("make")),
        model: String(fd.get("model")),
        registration: String(fd.get("registration")),
        category_id: String(fd.get("category_id")),
        daily_price_rs: Number(fd.get("daily_price_rs")),
        transmission: String(fd.get("transmission") || "") || null,
        seats: Number(fd.get("seats")) || null,
        home_location_id: String(fd.get("home_location_id") || "") || null,
        current_location_id: String(fd.get("home_location_id") || "") || null,
      });
    if (error) throw new Error(error.message);
    await audit(
      staff,
      "vehicle.create",
      "vehicle",
      String(fd.get("registration")),
    );
    revalidatePath("/dashboard/fleet");
  }

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.parse(today) + 14 * 86400e3)
    .toISOString()
    .slice(0, 10);
  const flag = (d: string | null) =>
    !d
      ? ""
      : d < today
        ? "text-red-700 font-medium"
        : d <= soon
          ? "text-amber-700"
          : "";

  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Fleet</h1>
      <div className="mb-4 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="p-2">Car</th>
              <th>Reg.</th>
              <th>Status</th>
              <th>Rs/day</th>
              <th>km</th>
              <th>Insurance</th>
              <th>Inspection</th>
              <th>Service due</th>
            </tr>
          </thead>
          <tbody>
            {(vehicles ?? []).map((v) => (
              <tr key={v.id} className="border-t hover:bg-zinc-50">
                <td className="p-2">
                  <Link className="underline" href={`/dashboard/fleet/${v.id}`}>
                    {v.vehicle_code} {v.make} {v.model}
                  </Link>
                </td>
                <td>{v.registration}</td>
                <td>
                  <Badge value={v.status} />
                </td>
                <td>{v.daily_price_rs}</td>
                <td>{v.mileage}</td>
                <td className={flag(v.insurance_expiry)}>
                  {fmtDate(v.insurance_expiry)}
                </td>
                <td className={flag(v.inspection_expiry)}>
                  {fmtDate(v.inspection_expiry)}
                </td>
                <td className={flag(v.next_service_due)}>
                  {fmtDate(v.next_service_due)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card title="Add vehicle">
        <form
          action={addVehicle}
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          <input name="make" placeholder="Make" required className={input} />
          <input name="model" placeholder="Model" required className={input} />
          <input
            name="registration"
            placeholder="Registration"
            required
            className={input}
          />
          <input
            name="daily_price_rs"
            type="number"
            placeholder="Rs per day"
            required
            className={input}
          />
          <select name="category_id" className={input}>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            name="transmission"
            placeholder="Transmission"
            className={input}
          />
          <input
            name="seats"
            type="number"
            placeholder="Seats"
            className={input}
          />
          <select name="home_location_id" className={input}>
            <option value="">Home location</option>
            {(locations ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button className={`${btnPrimary} col-span-2 sm:col-span-1`}>
            Add
          </button>
        </form>
      </Card>
      <p className="hidden">
        <span className={btn} />
      </p>
    </>
  );
}
