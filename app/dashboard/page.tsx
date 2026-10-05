import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  await requireAuth();
  const db = getServiceSupabase();
  const [{ data: notes }, { data: bookings }] = await Promise.all([
    db
      .from("owner_notifications")
      .select("id, title, body, type, booking_id, created_at")
      .eq("status", "OPEN")
      .order("created_at", { ascending: false }),
    db
      .from("bookings")
      .select(
        "id, booking_number, status, payment_status, document_status, pickup_at, return_at, total_rs, customers(full_name, whatsapp_number), vehicles(make, model, registration)",
      )
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  async function resolve(formData: FormData) {
    "use server";
    await requireAuth();
    await getServiceSupabase()
      .from("owner_notifications")
      .update({ status: "RESOLVED", resolved_at: new Date().toISOString() })
      .eq("id", String(formData.get("id")));
    revalidatePath("/dashboard");
  }

  const fmt = (s: string | null) =>
    s
      ? new Date(s).toLocaleString("en-GB", { timeZone: "Indian/Mauritius" })
      : "—";

  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>

      <h2 className="mb-2 font-semibold">
        Needs attention ({notes?.length ?? 0})
      </h2>
      <ul className="mb-6 flex flex-col gap-2">
        {(notes ?? []).map((n) => (
          <li key={n.id} className="rounded border p-3">
            <div className="font-medium">{n.title}</div>
            {n.body && <div className="text-sm text-zinc-600">{n.body}</div>}
            <div className="mt-2 flex gap-3 text-sm">
              {n.booking_id && (
                <Link
                  className="underline"
                  href={`/dashboard/bookings/${n.booking_id}`}
                >
                  Open booking
                </Link>
              )}
              <form action={resolve}>
                <input type="hidden" name="id" value={n.id} />
                <button className="underline">Resolve</button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mb-2 font-semibold">Bookings</h2>
      <ul className="flex flex-col gap-2">
        {(bookings ?? []).map((b) => {
          const c = b.customers as unknown as {
            full_name: string | null;
            whatsapp_number: string;
          } | null;
          const v = b.vehicles as unknown as {
            make: string;
            model: string;
            registration: string;
          } | null;
          return (
            <li key={b.id}>
              <Link
                href={`/dashboard/bookings/${b.id}`}
                className="block rounded border p-3"
              >
                <div className="font-medium">
                  #{b.booking_number} · {c?.full_name ?? c?.whatsapp_number}
                </div>
                <div className="text-sm text-zinc-600">
                  {v ? `${v.make} ${v.model}` : "No car yet"} ·{" "}
                  {fmt(b.pickup_at)} → {fmt(b.return_at)}
                </div>
                <div className="mt-1 text-xs">
                  {b.status} · docs {b.document_status} · {b.payment_status}
                  {b.total_rs != null && ` · Rs ${b.total_rs}`}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
