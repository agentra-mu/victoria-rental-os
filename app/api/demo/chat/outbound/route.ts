import { z } from "zod";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api/http";
import { createSupabaseMessagingDb } from "@/lib/db/messagingDb";
import { handleDemoOutbound } from "@/lib/demo/chat";
import { guardDemoRoute } from "@/lib/demo/mode";
import { alertError } from "@/lib/monitoring/log";
import { getServiceSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({
  whatsapp_number: z.string().min(5).max(20),
  text: z.string().min(1).max(8000),
});

/** Called by n8n with the AI's reply, so the dashboard transcript shows both sides. */
export async function POST(request: Request) {
  const blocked = guardDemoRoute(request);
  if (blocked) return blocked;
  try {
    const body = bodySchema.parse(await readJsonBody(request));
    const result = await handleDemoOutbound(
      { messaging: createSupabaseMessagingDb(getServiceSupabase()) },
      { whatsappNumber: body.whatsapp_number, text: body.text },
    );
    return jsonOk(result);
  } catch (error) {
    await alertError("demo.chat.outbound failed", error);
    return jsonError(error);
  }
}
