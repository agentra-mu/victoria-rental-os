import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/demo/mode";
import { isDemoChatNumber } from "@/lib/demo/personas";
import { getServiceSupabase } from "@/lib/supabase/server";
import { DEMO_PUSH_ID_PREFIX } from "@/lib/whatsapp/send";

export const dynamic = "force-dynamic";

/**
 * Public (the /demo page polls it) but demo-only and limited to demo chat
 * numbers. Returns what the bot/team sent from the DASHBOARD side: owner
 * replies and the Simulate-VERIFIED message. Normal bot replies already
 * arrive through the n8n chat widget itself.
 */
export async function GET(request: Request) {
  if (!isDemoMode()) return new NextResponse("Not found", { status: 404 });
  const url = new URL(request.url);
  const number = url.searchParams.get("whatsapp_number") ?? "";
  if (!isDemoChatNumber(number)) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "NOT_A_DEMO_NUMBER", message: "Not a demo number" },
      },
      { status: 403 },
    );
  }
  const after = url.searchParams.get("after");

  const db = getServiceSupabase();
  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("whatsapp_number", number)
    .maybeSingle();
  if (!customer) return NextResponse.json({ ok: true, data: { messages: [] } });
  const { data: conversation } = await db
    .from("conversations")
    .select("id, mode")
    .eq("customer_id", customer.id)
    .maybeSingle();
  if (!conversation)
    return NextResponse.json({ ok: true, data: { messages: [] } });

  let query = db
    .from("messages")
    .select("id, sender, body, created_at")
    .eq("conversation_id", conversation.id)
    .eq("direction", "OUTBOUND")
    .like("whatsapp_message_id", `${DEMO_PUSH_ID_PREFIX}%`)
    .order("created_at", { ascending: true })
    .limit(50);
  if (after) query = query.gt("created_at", after);
  const { data } = await query;
  return NextResponse.json({
    ok: true,
    data: { messages: data ?? [], mode: conversation.mode },
  });
}
