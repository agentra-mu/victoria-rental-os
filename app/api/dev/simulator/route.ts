import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

/** Dev/pilot only. Disabled in production unless ENABLE_SIMULATOR=true (so the owner can test before WhatsApp is approved). */
export function simulatorEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_SIMULATOR === "true"
  );
}

/** POST {phone, text|replyId}: forwards to /api/whatsapp/inbound exactly as n8n would. GET ?phone=: the stored thread. */
export async function POST(request: Request) {
  if (!simulatorEnabled())
    return new NextResponse("Not found", { status: 404 });
  const { phone, text, replyId } = (await request.json()) as {
    phone: string;
    text?: string;
    replyId?: string;
  };
  const origin = new URL(request.url).origin;
  const res = await fetch(`${origin}/api/whatsapp/inbound`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
    },
    body: JSON.stringify({
      from: phone.replace(/^\+/, ""),
      messageId: `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: replyId ? "button_reply" : "text",
      text,
      replyId,
    }),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function GET(request: Request) {
  if (!simulatorEnabled())
    return new NextResponse("Not found", { status: 404 });
  const phone = new URL(request.url).searchParams.get("phone") ?? "";
  const db = getServiceSupabase();
  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("whatsapp_number", phone.startsWith("+") ? phone : `+${phone}`)
    .maybeSingle();
  if (!customer) return NextResponse.json({ messages: [], uploadLink: null });
  const { data: conv } = await db
    .from("conversations")
    .select("id")
    .eq("customer_id", customer.id)
    .maybeSingle();
  const { data: messages } = conv
    ? await db
        .from("messages")
        .select("direction, sender, body, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at")
    : { data: [] };
  const { data: booking } = await db
    .from("bookings")
    .select("booking_number, upload_token, status")
    .eq("customer_id", customer.id)
    .not("upload_token", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({
    messages,
    booking: booking
      ? { number: booking.booking_number, status: booking.status }
      : null,
    uploadLink: booking?.upload_token
      ? `/documents/${booking.upload_token}`
      : null,
  });
}
