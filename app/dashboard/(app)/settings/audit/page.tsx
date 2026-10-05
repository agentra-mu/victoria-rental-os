import { requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { btn, fmtDateTime, input } from "../../../_components/ui";

export const dynamic = "force-dynamic";

export default async function Audit({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff("audit_log");
  const q = await searchParams;
  const db = getServiceSupabase();
  let query = db
    .from("audit_log")
    .select(
      "id, action, entity, entity_id, details, created_at, staff_users(name)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (q.user) query = query.eq("staff_user_id", q.user);
  if (q.action) query = query.ilike("action", `%${q.action}%`);
  if (q.from) query = query.gte("created_at", `${q.from}T00:00:00+04:00`);
  if (q.to) query = query.lte("created_at", `${q.to}T23:59:59+04:00`);
  const [{ data }, { data: staff }] = await Promise.all([
    query,
    db.from("staff_users").select("id, name"),
  ]);
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Audit log</h1>
      <form className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select name="user" defaultValue={q.user ?? ""} className={input}>
          <option value="">Any user</option>
          {(staff ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          name="action"
          defaultValue={q.action}
          placeholder="Action contains…"
          className={input}
        />
        <input
          type="date"
          name="from"
          defaultValue={q.from}
          className={input}
        />
        <input type="date" name="to" defaultValue={q.to} className={input} />
        <button className={btn}>Filter</button>
      </form>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <th className="p-2">When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 whitespace-nowrap">
                  {fmtDateTime(r.created_at)}
                </td>
                <td>
                  {(r.staff_users as unknown as { name: string } | null)
                    ?.name ?? "—"}
                </td>
                <td>{r.action}</td>
                <td>
                  {r.entity} {r.entity_id?.slice(0, 8)}
                </td>
                <td className="max-w-xs truncate">
                  {r.details ? JSON.stringify(r.details) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
