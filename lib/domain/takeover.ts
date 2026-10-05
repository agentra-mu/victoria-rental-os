import type { SupabaseClient } from "@supabase/supabase-js";

export const WINDOW_HOURS = 24;
/** Default hours in HUMAN mode with no owner message before a reminder is raised. */
export const TAKEOVER_REMINDER_HOURS = 12;

/** WhatsApp only allows free-form replies within 24h of the customer's last inbound message. */
export function isWithin24hWindow(
  lastInboundAt: string | null,
  now: Date,
): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - Date.parse(lastInboundAt) < WINDOW_HOURS * 3600_000;
}

export function needsTakeoverReminder(
  conv: {
    mode: string;
    taken_over_at: string | null;
    last_owner_message_at: string | null;
    takeover_reminder_sent_at: string | null;
  },
  now: Date,
  hours = TAKEOVER_REMINDER_HOURS,
): boolean {
  if (conv.mode !== "HUMAN" || conv.takeover_reminder_sent_at) return false;
  const since = conv.last_owner_message_at ?? conv.taken_over_at;
  if (!since) return false;
  return now.getTime() - Date.parse(since) > hours * 3600_000;
}

export async function takeOverConversation(
  client: SupabaseClient,
  conversationId: string,
  staffUserId: string,
): Promise<void> {
  const { error } = await client
    .from("conversations")
    .update({
      mode: "HUMAN",
      taken_over_by: staffUserId,
      taken_over_at: new Date().toISOString(),
      takeover_reminder_sent_at: null,
    })
    .eq("id", conversationId);
  if (error) throw error;
}

export interface Summarizer {
  (transcript: string): Promise<string>;
}

/**
 * Back to AI. Summarises what the owner discussed since takeover (via the
 * injected summariser — Claude in production) so the agent's next turn can
 * pick up the thread.
 */
export async function returnToAI(
  client: SupabaseClient,
  conversationId: string,
  summarize: Summarizer,
): Promise<void> {
  const { data: conv } = await client
    .from("conversations")
    .select("taken_over_at")
    .eq("id", conversationId)
    .single();
  let summary: string | null = null;
  if (conv?.taken_over_at) {
    const { data: msgs } = await client
      .from("messages")
      .select("direction, sender, body, created_at")
      .eq("conversation_id", conversationId)
      .gte("created_at", conv.taken_over_at)
      .order("created_at", { ascending: true });
    if (msgs && msgs.length > 0) {
      const transcript = msgs
        .map(
          (m) => `${m.sender === "customer" ? "Customer" : "Team"}: ${m.body}`,
        )
        .join("\n");
      try {
        summary = await summarize(transcript);
      } catch {
        summary = null; // summary is best-effort; never block the handback
      }
    }
  }
  const { error } = await client
    .from("conversations")
    .update({ mode: "AI", human_summary: summary })
    .eq("id", conversationId);
  if (error) throw error;
}

/** Raises a reminder (never auto-returns to AI) for conversations stuck in HUMAN mode. */
export async function raiseTakeoverReminders(
  client: SupabaseClient,
  now: Date,
  hours = TAKEOVER_REMINDER_HOURS,
): Promise<number> {
  const { data } = await client
    .from("conversations")
    .select(
      "id, mode, taken_over_at, last_owner_message_at, takeover_reminder_sent_at, customers(whatsapp_number)",
    )
    .eq("mode", "HUMAN");
  let raised = 0;
  for (const c of data ?? []) {
    if (!needsTakeoverReminder(c, now, hours)) continue;
    const customers = c.customers as unknown as {
      whatsapp_number: string;
    } | null;
    await client.from("owner_notifications").insert({
      type: "REMINDER",
      title: `Conversation with ${customers?.whatsapp_number ?? "a customer"} has been in human mode for over ${hours}h`,
      body: "Reply, or return it to the AI from the inbox.",
    });
    await client
      .from("conversations")
      .update({ takeover_reminder_sent_at: now.toISOString() })
      .eq("id", c.id);
    raised += 1;
  }
  return raised;
}
