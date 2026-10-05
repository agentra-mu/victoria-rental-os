import { requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { upsertRow } from "@/lib/dashboard/crud";
import { Card, btn, btnPrimary, input } from "../../../_components/ui";

export const dynamic = "force-dynamic";
const PATH = "/dashboard/settings/locations";
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

interface Loc {
  id: string;
  name: string;
  is_pickup: boolean;
  is_dropoff: boolean;
  instructions: string | null;
  google_maps_url: string | null;
  extra_fee_rs: number;
  after_hours_allowed: boolean;
  after_hours_fee_rs: number;
  active: boolean;
  opening_hours: Record<string, [string, string] | null> | null;
}

function LocationForm({
  l,
  action,
}: {
  l?: Loc;
  action: (fd: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="grid gap-2 text-sm">
      {l && <input type="hidden" name="id" value={l.id} />}
      <input
        name="name"
        defaultValue={l?.name}
        placeholder="Name"
        required
        className={input}
      />
      <textarea
        name="instructions"
        defaultValue={l?.instructions ?? ""}
        placeholder="Instructions sent to the customer (e.g. airport meeting point)"
        rows={2}
        className={input}
      />
      <input
        name="google_maps_url"
        defaultValue={l?.google_maps_url ?? ""}
        placeholder="Google Maps link"
        className={input}
      />
      <div className="grid grid-cols-2 gap-2">
        <label>
          Extra fee (Rs)
          <input
            name="extra_fee_rs"
            type="number"
            defaultValue={l?.extra_fee_rs ?? 0}
            className={input}
          />
        </label>
        <label>
          After-hours fee (Rs)
          <input
            name="after_hours_fee_rs"
            type="number"
            defaultValue={l?.after_hours_fee_rs ?? 0}
            className={input}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4">
        <label>
          <input
            type="checkbox"
            name="is_pickup"
            defaultChecked={l?.is_pickup ?? true}
          />{" "}
          Pickup
        </label>
        <label>
          <input
            type="checkbox"
            name="is_dropoff"
            defaultChecked={l?.is_dropoff ?? true}
          />{" "}
          Drop-off
        </label>
        <label>
          <input
            type="checkbox"
            name="after_hours_allowed"
            defaultChecked={l?.after_hours_allowed ?? false}
          />{" "}
          After-hours allowed
        </label>
        <label>
          <input
            type="checkbox"
            name="active"
            defaultChecked={l?.active ?? true}
          />{" "}
          Active
        </label>
      </div>
      <div className="text-xs text-zinc-500">
        Opening hours (leave both blank = closed that day; leave all blank = no
        restriction)
      </div>
      <div className="grid grid-cols-[40px_1fr_1fr] items-center gap-1">
        {DAYS.map((d) => (
          <div key={d} className="contents">
            <span className="uppercase">{d}</span>
            <input
              name={`${d}_open`}
              type="time"
              defaultValue={l?.opening_hours?.[d]?.[0] ?? ""}
              className={input}
            />
            <input
              name={`${d}_close`}
              type="time"
              defaultValue={l?.opening_hours?.[d]?.[1] ?? ""}
              className={input}
            />
          </div>
        ))}
      </div>
      <button className={l ? btn : btnPrimary}>
        {l ? "Save" : "Add location"}
      </button>
    </form>
  );
}

export default async function Locations() {
  await requireStaff("settings");
  const { data } = await getServiceSupabase()
    .from("locations")
    .select("*")
    .order("name");

  async function save(fd: FormData) {
    "use server";
    const hours: Record<string, [string, string] | null> = {};
    let any = false;
    for (const d of DAYS) {
      const o = String(fd.get(`${d}_open`) || ""),
        c = String(fd.get(`${d}_close`) || "");
      if (o && c) {
        hours[d] = [o, c];
        any = true;
      } else hours[d] = null;
    }
    await upsertRow(
      "settings",
      "locations",
      PATH,
      {
        name: String(fd.get("name")),
        instructions: String(fd.get("instructions") || "") || null,
        google_maps_url: String(fd.get("google_maps_url") || "") || null,
        extra_fee_rs: Number(fd.get("extra_fee_rs")) || 0,
        after_hours_fee_rs: Number(fd.get("after_hours_fee_rs")) || 0,
        is_pickup: fd.get("is_pickup") === "on",
        is_dropoff: fd.get("is_dropoff") === "on",
        after_hours_allowed: fd.get("after_hours_allowed") === "on",
        active: fd.get("active") === "on",
        opening_hours: any ? hours : null,
      },
      String(fd.get("id") || "") || null,
    );
  }

  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Locations</h1>
      <Card title="Add location">
        <LocationForm action={save} />
      </Card>
      {((data ?? []) as Loc[]).map((l) => (
        <Card key={l.id} title={l.name}>
          <LocationForm l={l} action={save} />
        </Card>
      ))}
    </>
  );
}
