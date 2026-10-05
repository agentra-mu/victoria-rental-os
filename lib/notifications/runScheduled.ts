import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { createSupabaseMessagingDb } from "@/lib/db/messagingDb";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp/send";
import { COMPANY_NAME } from "@/lib/agent/config";
import {
  computeDueMessages,
  digestDayKey,
  isDigestDue,
  type MessageKind,
  type ScheduleBooking,
} from "./schedule";
import { expireStaleRequests } from "@/lib/domain/changeRequestsDb";
import { raiseTakeoverReminders } from "@/lib/domain/takeover";
import { fleetAlertsDue } from "@/lib/domain/fleetAlerts";
import { fmtMauritius } from "./format";

const REVIEW_LINK = process.env.REVIEW_LINK;

interface Ctx {
  name: string;
  booking: number;
  pickup: string;
  ret: string;
  location: string;
  instructions: string;
  vehicle: string;
  total: string;
}

function textFor(kind: MessageKind, c: Ctx): string {
  switch (kind) {
    case "pickup_reminder":
      return `Hi ${c.name}, a reminder that your ${c.vehicle} (booking #${c.booking}) is ready for pickup tomorrow at ${c.pickup}${c.location ? ` from ${c.location}` : ""}. Please bring your passport and driving permit, and Rs ${c.total} in cash.`;
    case "pickup_day":
      return `Hi ${c.name}, your pickup is at ${c.pickup}${c.location ? ` — ${c.location}` : ""}.${c.instructions ? ` ${c.instructions}` : ""} See you soon!`;
    case "return_reminder":
      return `Good morning ${c.name}, a reminder that your ${c.vehicle} is due back today at ${c.ret}. If you're running late, just reply here and we'll arrange it.`;
    case "thank_you":
      return `Thank you for renting with ${COMPANY_NAME}, ${c.name}!${REVIEW_LINK ? ` We'd love a review: ${REVIEW_LINK}` : ""}`;
    case "docs_nudge_1":
    case "docs_nudge_2":
      return `Hi ${c.name}, we're still waiting for your passport and driving permit for booking #${c.booking}. Reply here if you need a new upload link.`;
    default:
      return "";
  }
}

/** Sends everything that's due, records each send, and runs the other periodic jobs. Called by /api/cron/notifications. */
export async function runScheduled(now = new Date()) {
  const db = getServiceSupabase();
  const messaging = createSupabaseMessagingDb(db as never);
  const result = {
    sent: 0,
    failed: 0,
    ownerNotified: 0,
    digest: false,
    expired: 0,
    takeoverReminders: 0,
    fleetAlerts: 0,
  };

  const { data: rows } = await db
    .from("bookings")
    .select(
      "id, customer_id, status, pickup_at, return_at, document_status, total_rs, customers(full_name, whatsapp_number, opted_out), vehicles(make, model), pickup:locations!bookings_pickup_location_id_fkey(name, instructions)",
    )
    .in("status", [
      "PENDING_DOCUMENTS",
      "DOCUMENTS_VERIFIED",
      "CONFIRMED",
      "PICKED_UP",
      "RETURNED",
      "COMPLETED",
    ]);
  const { data: sentRows } = await db
    .from("scheduled_messages")
    .select("booking_id, kind");
  const sent = new Set(
    (sentRows ?? []).map((s) => `${s.booking_id}:${s.kind}`),
  );
  const { data: pendingEvents } = await db
    .from("booking_events")
    .select("booking_id, created_at")
    .eq("event_type", "STATUS_CHANGED")
    .eq("new_value", "PENDING_DOCUMENTS");
  const pendingSince = new Map(
    (pendingEvents ?? []).map((e) => [
      e.booking_id as string,
      e.created_at as string,
    ]),
  );

  type Row = NonNullable<typeof rows>[number];
  const byId = new Map<string, Row>(
    (rows ?? []).map((r) => [r.id as string, r]),
  );
  const schedule: ScheduleBooking[] = (rows ?? []).map((r) => ({
    id: r.id,
    customerId: r.customer_id,
    status: r.status,
    pickupAt: r.pickup_at,
    returnAt: r.return_at,
    pendingDocumentsSince: pendingSince.get(r.id) ?? null,
    documentStatus: r.document_status,
    optedOut:
      (r.customers as unknown as { opted_out: boolean } | null)?.opted_out ??
      false,
  }));

  for (const due of computeDueMessages(schedule, sent, now)) {
    const r = byId.get(due.bookingId)!;
    const cust = r.customers as unknown as {
      full_name: string | null;
      whatsapp_number: string;
    };
    const veh = r.vehicles as unknown as { make: string; model: string } | null;
    const loc = r.pickup as unknown as {
      name: string;
      instructions: string | null;
    } | null;

    if (due.kind === "docs_owner_alert") {
      await messaging.createOwnerNotification({
        type: "REMINDER",
        title: `Customer hasn't uploaded documents (72h) — ${cust.full_name ?? cust.whatsapp_number}`,
        bookingId: due.bookingId,
      });
      await db
        .from("scheduled_messages")
        .insert({ booking_id: due.bookingId, kind: due.kind });
      result.ownerNotified += 1;
      continue;
    }

    const ctx: Ctx = {
      name: cust.full_name?.split(" ")[0] ?? "there",
      booking: 0,
      pickup: fmtMauritius(r.pickup_at),
      ret: fmtMauritius(r.return_at),
      location: loc?.name ?? "",
      instructions: loc?.instructions ?? "",
      vehicle: veh ? `${veh.make} ${veh.model}` : "car",
      total: String(r.total_rs ?? ""),
    };
    const { data: bn } = await db
      .from("bookings")
      .select("booking_number")
      .eq("id", r.id)
      .single();
    ctx.booking = bn?.booking_number ?? 0;

    const conversation = await messaging.getOrCreateConversation(r.customer_id);
    const sendCtx = {
      messaging,
      conversationId: conversation.id,
      sender: "ai" as const,
    };
    let status = "SENT";
    let messageId: string | null = null;
    try {
      const { data: tpl } = await db
        .from("message_templates")
        .select("template_name, language, parameter_mapping")
        .eq("kind", due.kind)
        .maybeSingle();
      if (tpl) {
        const params = ((tpl.parameter_mapping as string[]) ?? []).map((k) => ({
          type: "text" as const,
          text: String((ctx as unknown as Record<string, unknown>)[k] ?? ""),
        }));
        messageId = await sendTemplateMessage(
          sendCtx,
          cust.whatsapp_number,
          tpl.template_name,
          tpl.language,
          params.length ? [{ type: "body", parameters: params }] : undefined,
        );
      } else {
        messageId = await sendTextMessage(
          sendCtx,
          cust.whatsapp_number,
          textFor(due.kind, ctx),
        );
      }
      result.sent += 1;
    } catch {
      status = "FAILED";
      result.failed += 1;
    }
    await db.from("scheduled_messages").insert({
      booking_id: due.bookingId,
      kind: due.kind,
      whatsapp_message_id: messageId,
      status,
    });
  }

  // Owner digest (07:30 Mauritius), once per day.
  const { data: lastDigest } = await db
    .from("scheduled_messages")
    .select("kind")
    .like("kind", "digest_%")
    .order("sent_at", { ascending: false })
    .limit(1);
  const lastDay = lastDigest?.[0]?.kind?.replace("digest_", "") ?? null;
  if (isDigestDue(now, lastDay)) {
    const digest = await buildOwnerDigest(now);
    await messaging.createOwnerNotification({
      type: "REMINDER",
      title: "Daily digest",
      body: digest,
    });
    if (process.env.OWNER_WHATSAPP_NUMBER) {
      try {
        const owner = await messaging.findOrCreateCustomer(
          process.env.OWNER_WHATSAPP_NUMBER,
        );
        const conv = await messaging.getOrCreateConversation(owner.id);
        await sendTextMessage(
          { messaging, conversationId: conv.id, sender: "ai" },
          process.env.OWNER_WHATSAPP_NUMBER,
          digest,
        );
      } catch {
        // owner outside the 24h window — the dashboard notification above still exists
      }
    }
    await db
      .from("scheduled_messages")
      .insert({ kind: `digest_${digestDayKey(now)}` });
    result.digest = true;
  }

  result.expired = await expireStaleRequests(db, now);
  result.takeoverReminders = await raiseTakeoverReminders(db, now);
  result.fleetAlerts = await fleetAlertsDue(db, now);
  return result;
}

async function buildOwnerDigest(now: Date): Promise<string> {
  const db = getServiceSupabase();
  const dayKey = digestDayKey(now);
  const start = new Date(`${dayKey}T00:00:00+04:00`);
  const end = new Date(start.getTime() + 86400_000);
  const sel =
    "booking_number, pickup_at, return_at, payment_status, status, customers(full_name), pickup:locations!bookings_pickup_location_id_fkey(name), dropoff:locations!bookings_dropoff_location_id_fkey(name)";
  const [
    { data: pick },
    { data: ret },
    { data: unpaid },
    { data: reqs },
    { data: docs },
  ] = await Promise.all([
    db
      .from("bookings")
      .select(sel)
      .gte("pickup_at", start.toISOString())
      .lt("pickup_at", end.toISOString())
      .not("status", "in", "(CANCELLED,ENQUIRY)"),
    db
      .from("bookings")
      .select(sel)
      .gte("return_at", start.toISOString())
      .lt("return_at", end.toISOString())
      .not("status", "in", "(CANCELLED,ENQUIRY)"),
    db
      .from("bookings")
      .select("booking_number")
      .eq("payment_status", "UNPAID")
      .in("status", ["CONFIRMED", "DOCUMENTS_VERIFIED"]),
    db.from("booking_change_requests").select("id").eq("status", "PENDING"),
    db
      .from("bookings")
      .select("booking_number")
      .eq("document_status", "NEEDS_REVIEW"),
  ]);
  type B = {
    booking_number: number;
    pickup_at: string;
    return_at: string;
    customers: { full_name: string | null } | null;
    pickup: { name: string } | null;
    dropoff: { name: string } | null;
  };
  const group = (
    list: B[] | null,
    key: "pickup" | "dropoff",
    time: "pickup_at" | "return_at",
  ) => {
    const m = new Map<string, string[]>();
    for (const b of list ?? []) {
      const loc = b[key]?.name ?? "No location";
      m.set(loc, [
        ...(m.get(loc) ?? []),
        `#${b.booking_number} ${b.customers?.full_name ?? ""} ${fmtMauritius(b[time])}`,
      ]);
    }
    return (
      [...m]
        .map(([loc, items]) => `${loc}:\n  ${items.join("\n  ")}`)
        .join("\n") || "none"
    );
  };
  return [
    `Good morning — ${dayKey}`,
    `PICKUPS\n${group(pick as unknown as B[], "pickup", "pickup_at")}`,
    `RETURNS\n${group(ret as unknown as B[], "dropoff", "return_at")}`,
    `Unpaid confirmed bookings: ${(unpaid ?? []).map((b) => `#${b.booking_number}`).join(", ") || "none"}`,
    `Open change requests: ${reqs?.length ?? 0}`,
    `Documents needing review: ${(docs ?? []).map((b) => `#${b.booking_number}`).join(", ") || "none"}`,
  ].join("\n\n");
}
