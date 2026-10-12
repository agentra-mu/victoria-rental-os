import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/api/http";
import { createBotDeps } from "@/lib/bot/deps";
import { handleTurn } from "@/lib/bot/handleTurn";
import { isDemoMode } from "@/lib/demo/mode";
import { isDemoChatNumber } from "@/lib/demo/personas";
import { alertError } from "@/lib/monitoring/log";
import { getServiceSupabase } from "@/lib/supabase/server";
import { handleInboundMessage } from "@/lib/whatsapp/inbound";

const bodySchema = z
  .object({
    whatsapp_number: z.string().min(5).max(20),
    text: z.string().min(1).max(2000).optional(),
    reply_id: z.string().min(1).max(200).optional(),
  })
  .refine((b) => b.text || b.reply_id, "text or reply_id is required");

/**
 * The /demo web chat's stand-in for Meta's webhook: the same
 * handleInboundMessage → handleTurn path as /api/whatsapp/inbound, but the
 * replies come back to the browser. Demo-only and limited to demo numbers.
 */
export async function POST(request: Request) {
  if (!isDemoMode()) return new NextResponse("Not found", { status: 404 });
  try {
    const body = bodySchema.parse(await readJsonBody(request));
    if (!isDemoChatNumber(body.whatsapp_number)) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "NOT_A_DEMO_NUMBER", message: "Not a demo number" },
        },
        { status: 403 },
      );
    }
    const botDeps = createBotDeps(getServiceSupabase());
    const result = await handleInboundMessage(
      {
        messaging: botDeps.messaging,
        getActiveBookingForCustomer: (customerId) =>
          botDeps.domainDb.getActiveBookingForCustomer(customerId),
        runBot: (conversationId, message, preloaded) =>
          handleTurn(botDeps, conversationId, message, preloaded),
      },
      {
        from: body.whatsapp_number,
        messageId: `demo-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: body.reply_id ? "button_reply" : "text",
        text: body.text,
        replyId: body.reply_id,
      },
    );
    return NextResponse.json({
      ok: true,
      data: { replies: result.replies, debug: result.debug ?? null },
    });
  } catch (error) {
    await alertError("demo.chat.send failed", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Chat failed" } },
      { status: 500 },
    );
  }
}
