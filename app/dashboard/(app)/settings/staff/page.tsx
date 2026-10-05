import { revalidatePath } from "next/cache";
import { audit, requireAction, requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { PERMISSIONS } from "@/lib/domain/permissions";
import { Card, btn, btnPrimary, input } from "../../../_components/ui";

export const dynamic = "force-dynamic";
const PATH = "/dashboard/settings/staff";
// Owner-only permissions can't be granted to STAFF — only these are configurable.
const CONFIGURABLE = PERMISSIONS.filter(
  (p) =>
    ![
      "undo_payment",
      "reject_documents",
      "staff_management",
      "analytics",
      "settings",
      "audit_log",
      "data_export",
    ].includes(p),
);

export default async function Staff() {
  const me = await requireStaff("staff_management");
  const { data } = await getServiceSupabase()
    .from("staff_users")
    .select("id, name, email, role, active, permissions")
    .order("name");

  async function invite(fd: FormData) {
    "use server";
    const staff = await requireAction("staff_management");
    const db = getServiceSupabase();
    const email = String(fd.get("email"));
    const { data: invited, error } =
      await db.auth.admin.inviteUserByEmail(email);
    if (error || !invited.user)
      throw new Error(error?.message ?? "Invite failed");
    await db.from("staff_users").insert({
      id: invited.user.id,
      name: String(fd.get("name")),
      email,
      role: "STAFF",
    });
    await audit(staff, "staff.invite", "staff_user", invited.user.id, {
      email,
    });
    revalidatePath(PATH);
  }
  async function update(fd: FormData) {
    "use server";
    const staff = await requireAction("staff_management");
    const id = String(fd.get("id"));
    const permissions: Record<string, boolean> = {};
    for (const p of CONFIGURABLE) permissions[p] = fd.get(`perm_${p}`) === "on";
    await getServiceSupabase()
      .from("staff_users")
      .update({ active: fd.get("active") === "on", permissions })
      .eq("id", id);
    await audit(staff, "staff.update", "staff_user", id, {
      permissions,
      active: fd.get("active") === "on",
    });
    revalidatePath(PATH);
  }

  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Staff</h1>
      <Card title="Invite staff member">
        <form action={invite} className="grid grid-cols-2 gap-2">
          <input name="name" placeholder="Name" required className={input} />
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className={input}
          />
          <button className={`${btnPrimary} col-span-2`}>Send invite</button>
        </form>
      </Card>
      {(data ?? []).map((s) => (
        <Card key={s.id} title={`${s.name} · ${s.role}`}>
          {s.role === "OWNER" ? (
            <p className="text-sm text-zinc-500">
              Owner — full access.{s.id === me.id && " (you)"}
            </p>
          ) : (
            <form action={update} className="grid gap-2 text-sm">
              <input type="hidden" name="id" value={s.id} />
              <label>
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={s.active}
                />{" "}
                Active (untick to deactivate)
              </label>
              <div className="flex flex-wrap gap-3">
                {CONFIGURABLE.map((p) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      name={`perm_${p}`}
                      defaultChecked={
                        (s.permissions as Record<string, boolean>)?.[p] ?? true
                      }
                    />{" "}
                    {p}
                  </label>
                ))}
              </div>
              <button className={btn}>Save</button>
            </form>
          )}
        </Card>
      ))}
    </>
  );
}
