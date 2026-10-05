import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAgentModel } from "./client";

async function ask(system: string, user: string, maxTokens = 400) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await anthropic.messages.create({
    model: getAgentModel(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

/** Short note for the agent about what the owner discussed during a takeover. */
export function summarizeTakeover(transcript: string): Promise<string> {
  return ask(
    "Summarise, in 2-3 short sentences for an AI assistant taking over a WhatsApp car-rental chat, what the team and customer discussed and agreed, including anything still open. Do not invent facts.",
    transcript,
  );
}

/** A draft reply for the owner to edit — never sent automatically. */
export function suggestReply(context: string): Promise<string> {
  return ask(
    "You draft replies for a car rental team on WhatsApp. Write one short, friendly reply the team member can edit and send. Reply in the customer's language. Do not promise anything not in the context; prices are in Rs and payment is cash on collection.",
    context,
  );
}
