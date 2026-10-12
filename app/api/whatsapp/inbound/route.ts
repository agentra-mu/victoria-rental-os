import { z } from "zod";
import {
  checkInternalSecret,
  jsonError,
  jsonOk,
  readJsonBody,
} from "@/lib/api/http";
import { getServiceSupabase } from "@/lib/supabase/server";
import { createBotDeps } from "@/lib/bot/deps";
import { handleTurn } from "@/lib/bot/handleTurn";
import { alertError } from "@/lib/monitoring/log";
import { handleInboundMessage } from "@/lib/whatsapp/inbound";

const bodySchema = z.object({
  from: z.string().min(1),
  messageId: z.string().min(1),
  timestamp: z.string().min(1),
  type: z.enum([
    "text",
    "button_reply",
    "list_reply",
    "image",
    "document",
    "location",
  ]),
  text: z.string().optional(),
  replyId: z.string().optional(),
});

/**
 * Called by the n8n inbound workflow (/n8n/whatsapp-inbound.json) for every
 * WhatsApp message; n8n has already acknowledged Meta's webhook with a 200.
 * The conversation logic is lib/bot/handleTurn.ts (deterministic; an LLM is an
 * optional last resort) — this file is just wiring.
 */
export async function POST(request: Request) {
  const authError = checkInternalSecret(request);
  if (authError) return authError;

  try {
    const payload = bodySchema.parse(await readJsonBody(request));

    const botDeps = createBotDeps(getServiceSupabase());
    const result = await handleInboundMessage(
      {
        messaging: botDeps.messaging,
        getActiveBookingForCustomer: (customerId) =>
          botDeps.domainDb.getActiveBookingForCustomer(customerId),
        runBot: (conversationId, message, preloaded) =>
          handleTurn(botDeps, conversationId, message, preloaded),
      },
      payload,
    );
    return jsonOk(result);
  } catch (error) {
    await alertError("whatsapp.inbound failed", error);
    return jsonError(error);
  }
}
