import type { WhatsAppReply } from "@/lib/whatsapp/replies";
import type { HandledBy } from "./types";

/** What a layer returns when it took the message. */
export interface Handled {
  replies: WhatsAppReply[];
  handledBy: HandledBy;
  /** Short machine description for the turn log / simulator. */
  matched: string;
  unrecognised?: boolean;
  generatedBy?: "llm";
  notifyOwner?: { title: string; body?: string };
}
