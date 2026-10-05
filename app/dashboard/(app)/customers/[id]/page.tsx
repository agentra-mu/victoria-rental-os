import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { Badge, Card, fmtDateTime } from "../../../_components/ui";
import ConversationPanel from "../../../_components/ConversationPanel";

export const dynamic = "force-dynamic";

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await requireStaff("bookings");
  const { id } = await params;
  const db = getServiceSupabase();
  const { data: c } = await db
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();
  if (!c) notFound();
  const [{ data: bookings }, { data: conv }] = await Promise.all([
    db
      .from("bookings")
      .select(
        "id, booking_number, status, pickup_at, return_at, total_rs, payment_status",
      )
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    db.from("conversations").select("id").eq("customer_id", id).maybeSingle(),
  ]);
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">
        {c.full_name ?? "(no name yet)"}
      </h1>
      <p className="mb-4 text-sm text-zinc-600">
        {c.customer_code} · {c.whatsapp_number}
        {c.opted_out && " · opted out of reminders"}
      </p>
      <Card title="Bookings">
        <ul className="text-sm">
          {(bookings ?? []).map((b) => (
            <li key={b.id} className="border-b py-2">
              <Link className="underline" href={`/dashboard/bookings/${b.id}`}>
                #{b.booking_number}
              </Link>{" "}
              · {fmtDateTime(b.pickup_at)} → {fmtDateTime(b.return_at)} ·{" "}
              {b.total_rs != null && `Rs ${b.total_rs} · `}
              <Badge value={b.status} /> <Badge value={b.payment_status} />
            </li>
          ))}
        </ul>
      </Card>
      {conv && (
        <Card title="Conversation">
          <ConversationPanel conversationId={conv.id} staff={staff} />
        </Card>
      )}
    </>
  );
}
