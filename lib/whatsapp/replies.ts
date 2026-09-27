import {
  buildListMessage,
  buildReplyButtonsMessage,
  type WhatsAppButtonInput,
  type WhatsAppListMessage,
  type WhatsAppListRowInput,
  type WhatsAppButtonsMessage,
} from "./format";

/**
 * What /app/api/whatsapp/inbound hands back to n8n. n8n only wraps this with
 * the recipient/envelope fields (`messaging_product`, `to`, `type`) and posts
 * it to the Graph API — the `interactive` object itself is already fully
 * built and tested here, so no WhatsApp-payload logic lives in n8n.
 */
export type WhatsAppReply =
  | { type: "text"; text: string }
  | { type: "buttons"; interactive: WhatsAppButtonsMessage }
  | { type: "list"; interactive: WhatsAppListMessage };

export function textReply(text: string): WhatsAppReply {
  return { type: "text", text };
}

export function buttonsReply(
  bodyText: string,
  buttons: WhatsAppButtonInput[],
): WhatsAppReply {
  return {
    type: "buttons",
    interactive: buildReplyButtonsMessage({ bodyText, buttons }),
  };
}

export function listReply(
  bodyText: string,
  buttonText: string,
  rows: WhatsAppListRowInput[],
): WhatsAppReply {
  return {
    type: "list",
    interactive: buildListMessage({ bodyText, buttonText, rows }),
  };
}

/** The text stored in the messages table for an outbound reply, whatever its shape. */
export function replyBodyText(reply: WhatsAppReply): string {
  return reply.type === "text" ? reply.text : reply.interactive.body.text;
}
