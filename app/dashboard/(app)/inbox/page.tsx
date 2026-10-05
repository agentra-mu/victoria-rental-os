import Link from "next/link";
import { requireStaff } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  conversationPriority,
  type Priority,
} from "@/lib/domain/inboxPriority";
import { Badge, Card, btnPrimary, fmtDateTime } from "../../_components/ui";
import ConversationPanel from "../../_components/ConversationPanel";
import AutoRefresh from "../../_components/AutoRefresh";
import RedAlert from "../../_components/RedAlert";
import ConfirmButton from "../../_components/ConfirmButton";
import { payAction } from "../bookings/[id]/actions";

export const dynamic = "force-dynamic";

const DOT: Record<Priority, string> = {
  red: "bg-red-500",
  amber: "bg-amber-400",
  green: "bg-green-500",
};

export default async function Inbox({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; f?: string }>;
}) {
  const staff = await requireStaff("inbox");
  const { c: selected, f = "attention" } = await searchParams;
  const db = getServiceSupabase();

  const [{ data: convs }, { data: msgs }, { data: bookings }, { data: notes }] =
    await Promise.all([
      db
        .from("conversations")
        .select(
          "id, mode, last_message_at, assigned_to, customer_id, customers(full_name, whatsapp_number)",
        )
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100),
      db
        .from("messages")
        .select("conversation_id, body, created_at")
        .order("created_at", { ascending: false })
        .limit(400),
      db
        .from("bookings")
        .select(
          "id, booking_number, status, document_status, payment_status, total_rs, customer_id, vehicle_id, created_at",
        )
        .not("status", "in", "(CANCELLED,COMPLETED)")
        .order("created_at", { ascending: false }),
      db
        .from("owner_notifications")
        .select("booking_id, type")
        .eq("status", "OPEN"),
    ]);

  const preview = new Map<string, string>();
  for (const m of msgs ?? [])
    if (!preview.has(m.conversation_id)) preview.set(m.conversation_id, m.body);

  const items = (convs ?? []).map((cv) => {
    const cust = cv.customers as unknown as {
      full_name: string | null;
      whatsapp_number: string;
    } | null;
    const booking =
      (bookings ?? []).find((b) => b.customer_id === cv.customer_id) ?? null;
    const types = (notes ?? [])
      .filter((n) => booking && n.booking_id === booking.id)
      .map((n) => n.type as string);
    const priority = conversationPriority({
      mode: cv.mode,
      bookingStatus: booking?.status,
      documentStatus: booking?.document_status,
      openNotificationTypes: types,
    });
    return { cv, cust, booking, priority };
  });
  const redCount = items.filter((i) => i.priority === "red").length;
  const shown = items.filter((i) =>
    f === "all"
      ? true
      : f === "human"
        ? i.cv.mode === "HUMAN"
        : i.priority !== "green",
  );
  const current = items.find((i) => i.cv.id === selected);

  let pendingRequests: {
    id: string;
    type: string;
    quoted_additional_rs: number;
  }[] = [];
  if (current?.booking) {
    const { data } = await db
      .from("booking_change_requests")
      .select("id, type, quoted_additional_rs")
      .eq("booking_id", current.booking.id)
      .eq("status", "PENDING");
    pendingRequests = data ?? [];
  }

  return (
    <>
      <AutoRefresh seconds={8} />
      <RedAlert count={redCount} />
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div>
          <div className="mb-2 flex gap-1 text-sm">
            {[
              ["attention", "Needs attention"],
              ["human", "Human mode"],
              ["all", "All"],
            ].map(([k, label]) => (
              <Link
                key={k}
                href={`?f=${k}`}
                className={`rounded border px-2 py-1 ${f === k ? "bg-black text-white" : "bg-white"}`}
              >
                {label}
              </Link>
            ))}
          </div>
          <ul className="flex max-h-[75vh] flex-col overflow-y-auto rounded-lg border bg-white">
            {shown.map(({ cv, cust, booking, priority }) => (
              <li key={cv.id}>
                <Link
                  href={`?f=${f}&c=${cv.id}`}
                  className={`block border-b p-3 hover:bg-zinc-50 ${cv.id === selected ? "bg-zinc-100" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${DOT[priority]}`}
                    />
                    <b className="truncate text-sm">
                      {cust?.full_name ?? cust?.whatsapp_number}
                    </b>
                    {cv.mode === "HUMAN" && (
                      <span className="rounded bg-red-100 px-1 text-[10px] text-red-800">
                        HUMAN
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-zinc-500">
                      {fmtDateTime(cv.last_message_at)}
                    </span>
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {booking ? `#${booking.booking_number} · ` : ""}
                    {preview.get(cv.id) ?? ""}
                  </div>
                </Link>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="p-4 text-sm text-zinc-500">Nothing here.</li>
            )}
          </ul>
        </div>

        <div>
          {current ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
              <Card
                title={
                  current.cust?.full_name ??
                  current.cust?.whatsapp_number ??
                  "Conversation"
                }
              >
                <ConversationPanel
                  conversationId={current.cv.id}
                  staff={staff}
                />
              </Card>
              <Card title="Booking">
                {current.booking ? (
                  <div className="text-sm">
                    <div className="mb-1 font-medium">
                      #{current.booking.booking_number}
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1">
                      <Badge value={current.booking.status} />
                      <Badge value={current.booking.payment_status} />
                      <Badge
                        value={`DOCS ${current.booking.document_status}`}
                      />
                    </div>
                    <div className="mb-2">
                      {current.booking.total_rs != null &&
                        `Rs ${current.booking.total_rs}`}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Link
                        className="underline"
                        href={`/dashboard/bookings/${current.booking.id}`}
                      >
                        Open booking
                      </Link>
                      {current.booking.payment_status !== "PAID" && (
                        <form action={payAction}>
                          <input
                            type="hidden"
                            name="id"
                            value={current.booking.id}
                          />
                          <ConfirmButton
                            className={btnPrimary}
                            message="Confirm cash received?"
                          >
                            Mark paid
                          </ConfirmButton>
                        </form>
                      )}
                      {pendingRequests.map((r) => (
                        <Link
                          key={r.id}
                          className="rounded border border-amber-300 bg-amber-50 p-2"
                          href={`/dashboard/bookings/${current.booking!.id}`}
                        >
                          {r.type.replace(/_/g, " ")} (+Rs{" "}
                          {r.quoted_additional_rs}) — review
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">No active booking.</p>
                )}
              </Card>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Select a conversation.</p>
          )}
        </div>
      </div>
    </>
  );
}
