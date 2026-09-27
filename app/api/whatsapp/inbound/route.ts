import { z } from "zod";
import {
  checkInternalSecret,
  jsonError,
  jsonOk,
  readJsonBody,
} from "@/lib/api/http";
import { getServiceSupabase } from "@/lib/supabase/server";
import { createSupabaseDomainDb } from "@/lib/db/domainDb";
import { createSupabaseMessagingDb } from "@/lib/db/messagingDb";
import { escalateBookingToHuman } from "@/lib/domain/escalateBookingToHuman";
import { createAnthropicModelClient } from "@/lib/agent/client";
import { runAgentTurn } from "@/lib/agent/runAgent";
import { handleInboundMessage, type InboundDeps } from "@/lib/whatsapp/inbound";

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
 * WhatsApp message. Dedupes on whatsapp_message_id, finds/creates the
 * customer and conversation, stores the message, handles the HUMAN-takeover
 * flow, and otherwise calls the (stub, for now) AI agent. See
 * /lib/whatsapp/inbound.ts for the actual logic — this file is just wiring.
 */
export async function POST(request: Request) {
  const authError = checkInternalSecret(request);
  if (authError) return authError;

  try {
    const payload = bodySchema.parse(await readJsonBody(request));

    const client = getServiceSupabase();
    const bookingDb = createSupabaseDomainDb(client);
    const messagingDb = createSupabaseMessagingDb(client);
    const model = createAnthropicModelClient();
    const deps: InboundDeps = {
      messaging: messagingDb,
      getActiveBookingForCustomer: (customerId) =>
        bookingDb.getActiveBookingForCustomer(customerId),
      escalateBookingToHuman: async (bookingId) => {
        await escalateBookingToHuman(bookingDb, bookingId);
      },
      runAgent: (conversationId) =>
        runAgentTurn(
          { domainDb: bookingDb, messaging: messagingDb, model },
          conversationId,
        ),
    };

    const result = await handleInboundMessage(deps, payload);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
