import "server-only";
import { requireEnv } from "@/lib/env";
import {
  buildListMessage,
  buildReplyButtonsMessage,
  type WhatsAppButtonInput,
  type WhatsAppListRowInput,
} from "./format";
import type { MessageSender, MessagingDb } from "./ports";

const WHATSAPP_API_VERSION = "v21.0";

/**
 * Meta's error code for a customer-service-window violation: sending a
 * free-form/interactive message more than 24h after the customer's last
 * inbound message, with no approved template covering it. See the 24h
 * window note in /n8n/README.md.
 */
const OUTSIDE_WINDOW_ERROR_CODE = 131047;

export type WhatsAppSendErrorCode = "OUTSIDE_24H_WINDOW" | "SEND_FAILED";

export class WhatsAppSendError extends Error {
  readonly code: WhatsAppSendErrorCode;
  readonly metaError?: unknown;

  constructor(
    code: WhatsAppSendErrorCode,
    message: string,
    metaError?: unknown,
  ) {
    super(message);
    this.name = "WhatsAppSendError";
    this.code = code;
    this.metaError = metaError;
  }
}

interface GraphApiSuccess {
  messages: [{ id: string }];
}

interface GraphApiErrorBody {
  error: {
    message: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/** Graph API wants the number as digits only — our stored whatsapp_number is E.164 with a "+". */
function stripLeadingPlus(phone: string): string {
  return phone.replace(/^\+/, "");
}

async function postToGraphApi(
  body: { to: string } & Record<string, unknown>,
): Promise<string> {
  const env = requireEnv(process.env, [
    "WHATSAPP_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
  ]);
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      ...body,
      to: stripLeadingPlus(body.to),
    }),
  });

  const json = (await response.json()) as GraphApiSuccess | GraphApiErrorBody;

  if (!response.ok || "error" in json) {
    const metaError = "error" in json ? json.error : undefined;
    const isOutsideWindow =
      metaError?.code === OUTSIDE_WINDOW_ERROR_CODE ||
      metaError?.error_subcode === OUTSIDE_WINDOW_ERROR_CODE;
    throw new WhatsAppSendError(
      isOutsideWindow ? "OUTSIDE_24H_WINDOW" : "SEND_FAILED",
      isOutsideWindow
        ? "Can't send a free-form message — this customer hasn't messaged in the last 24h. Send an approved template instead."
        : (metaError?.message ??
            `WhatsApp send failed with status ${response.status}`),
      metaError,
    );
  }

  return json.messages[0].id;
}

export interface SendContext {
  messaging: MessagingDb;
  conversationId: string;
  sender: MessageSender;
}

/** Sends a plain text message and stores it as an outbound message. */
export async function sendTextMessage(
  ctx: SendContext,
  to: string,
  text: string,
): Promise<string> {
  const messageId = await postToGraphApi({
    to,
    type: "text",
    text: { body: text },
  });
  await ctx.messaging.storeMessage({
    conversationId: ctx.conversationId,
    direction: "OUTBOUND",
    sender: ctx.sender,
    body: text,
    whatsappMessageId: messageId,
  });
  return messageId;
}

/** Sends a reply-buttons interactive message (max 3 buttons — see /lib/whatsapp/format.ts). */
export async function sendButtonsMessage(
  ctx: SendContext,
  to: string,
  bodyText: string,
  buttons: WhatsAppButtonInput[],
): Promise<string> {
  const interactive = buildReplyButtonsMessage({ bodyText, buttons });
  const messageId = await postToGraphApi({
    to,
    type: "interactive",
    interactive,
  });
  await ctx.messaging.storeMessage({
    conversationId: ctx.conversationId,
    direction: "OUTBOUND",
    sender: ctx.sender,
    body: bodyText,
    whatsappMessageId: messageId,
  });
  return messageId;
}

/** Sends a list interactive message (max 10 rows — see /lib/whatsapp/format.ts). */
export async function sendListMessage(
  ctx: SendContext,
  to: string,
  bodyText: string,
  buttonText: string,
  rows: WhatsAppListRowInput[],
): Promise<string> {
  const interactive = buildListMessage({ bodyText, buttonText, rows });
  const messageId = await postToGraphApi({
    to,
    type: "interactive",
    interactive,
  });
  await ctx.messaging.storeMessage({
    conversationId: ctx.conversationId,
    direction: "OUTBOUND",
    sender: ctx.sender,
    body: bodyText,
    whatsappMessageId: messageId,
  });
  return messageId;
}

export interface TemplateComponent {
  type: "header" | "body" | "button";
  parameters: { type: "text"; text: string }[];
}

/** Sends an approved template message — the only way to reach a customer outside the 24h window. */
export async function sendTemplateMessage(
  ctx: SendContext,
  to: string,
  templateName: string,
  languageCode: string,
  components?: TemplateComponent[],
): Promise<string> {
  const messageId = await postToGraphApi({
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  });
  await ctx.messaging.storeMessage({
    conversationId: ctx.conversationId,
    direction: "OUTBOUND",
    sender: ctx.sender,
    body: `[template: ${templateName}]`,
    whatsappMessageId: messageId,
  });
  return messageId;
}
