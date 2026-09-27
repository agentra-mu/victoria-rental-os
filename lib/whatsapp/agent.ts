import { textReply, type WhatsAppReply } from "./replies";

/**
 * Placeholder for the Claude-powered conversation agent (Component 5).
 * Signature is stable so /lib/whatsapp/inbound.ts doesn't change when the
 * real implementation lands.
 */
export async function runAgent(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for signature parity with the real Component 5 implementation
  conversationId: string,
): Promise<WhatsAppReply[]> {
  return [
    textReply(
      "Thanks for your message! Our booking assistant is being set up — a member of our team will get back to you shortly.",
    ),
  ];
}
