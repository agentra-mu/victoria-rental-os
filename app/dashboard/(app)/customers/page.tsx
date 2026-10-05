import Link from "next/link";
import { requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { btn, fmtDate, input } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireStaff("bookings");
  const { q } = await searchParams;
  let query = getServiceSupabase()
    .from("customers")
    .select("id, customer_code, full_name, whatsapp_number, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (q?.trim())
    query = query.or(
      `full_name.ilike.%${q}%,whatsapp_number.ilike.%${q}%,customer_code.ilike.%${q}%`,
    );
  const { data } = await query;
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Customers</h1>
      <form className="mb-3 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Name, phone or code"
          className={input}
        />
        <button className={btn}>Search</button>
      </form>
      <ul className="flex flex-col gap-2">
        {(data ?? []).map((c) => (
          <li key={c.id}>
            <Link
              href={`/dashboard/customers/${c.id}`}
              className="block rounded border bg-white p-3 hover:bg-zinc-50"
            >
              <b>{c.full_name ?? "(no name yet)"}</b> · {c.whatsapp_number} ·{" "}
              <span className="text-zinc-500">
                {c.customer_code} · since {fmtDate(c.created_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
