import { z } from "zod";
import { jsonError, jsonOk, readJsonBody } from "@/lib/api/http";
import { createSupabaseDomainDb } from "@/lib/db/domainDb";
import { createSupabaseMessagingDb } from "@/lib/db/messagingDb";
import { handleDemoInbound } from "@/lib/demo/chat";
import { guardDemoRoute } from "@/lib/demo/mode";
import { alertError } from "@/lib/monitoring/log";
import { getServiceSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({
  whatsapp_number: z.string().min(5).max(20),
  text: z.string().min(1).max(4000),
  message_id: z.string().min(1).max(200),
});

/** Called by n8n for every web-chat message before the AI runs. See lib/demo/chat.ts. */
export async function POST(request: Request) {
  const blocked = guardDemoRoute(request);
  if (blocked) return blocked;
  try {
    const body = bodySchema.parse(await readJsonBody(request));
    const client = getServiceSupabase();
    const result = await handleDemoInbound(
      {
        messaging: createSupabaseMessagingDb(client),
        domainDb: createSupabaseDomainDb(client),
      },
      {
        whatsappNumber: body.whatsapp_number,
        text: body.text,
        messageId: body.message_id,
      },
    );
    return jsonOk(result);
  } catch (error) {
    await alertError("demo.chat.inbound failed", error);
    return jsonError(error);
  }
}
