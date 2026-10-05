"use server";

import { revalidatePath } from "next/cache";
import { audit, requireAction } from "@/lib/dashboard/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { createSupabaseMessagingDb } from "@/lib/db/messagingDb";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp/send";
import { returnToAI, takeOverConversation } from "@/lib/domain/takeover";
import { suggestReply, summarizeTakeover } from "@/lib/agent/assist";

function messaging() {
  return createSupabaseMessagingDb(getServiceSupabase() as never);
}

async function loadConversation(conversationId: string) {
  const { data } = await getServiceSupabase()
    .from("conversations")
    .select("id, customer_id, customers(whatsapp_number, full_name)")
    .eq("id", conversationId)
    .single();
  if (!data) throw new Error("Conversation not found");
  const customer = data.customers as unknown as {
    whatsapp_number: string;
    full_name: string | null;
  };
  return {
    id: data.id as string,
    customerId: data.customer_id as string,
    customer,
  };
}

export async function takeOver(formData: FormData) {
  const staff = await requireAction("takeover");
  const id = String(formData.get("conversationId"));
  await takeOverConversation(getServiceSupabase(), id, staff.id);
  await audit(staff, "conversation.takeover", "conversation", id);
  revalidatePath("/dashboard", "layout");
}

export async function handBackToAI(formData: FormData) {
  const staff = await requireAction("takeover");
  const id = String(formData.get("conversationId"));
  await returnToAI(getServiceSupabase(), id, summarizeTakeover);
  await audit(staff, "conversation.return_to_ai", "conversation", id);
  revalidatePath("/dashboard", "layout");
}

/** Replies as the business. Throws a clear message if the 24h window has closed. */
export async function sendReply(formData: FormData) {
  const staff = await requireAction("takeover");
  const id = String(formData.get("conversationId"));
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  const conv = await loadConversation(id);
  await sendTextMessage(
    { messaging: messaging(), conversationId: id, sender: "owner" },
    conv.customer.whatsapp_number,
    text,
  );
  await getServiceSupabase()
    .from("conversations")
    .update({ last_owner_message_at: new Date().toISOString() })
    .eq("id", id);
  await audit(staff, "conversation.reply", "conversation", id);
  revalidatePath("/dashboard", "layout");
}

export async function sendTemplate(formData: FormData) {
  const staff = await requireAction("takeover");
  const id = String(formData.get("conversationId"));
  const kind = String(formData.get("templateKind"));
  const { data: tpl } = await getServiceSupabase()
    .from("message_templates")
    .select("template_name, language")
    .eq("kind", kind)
    .single();
  if (!tpl) throw new Error("Template not configured");
  const conv = await loadConversation(id);
  await sendTemplateMessage(
    { messaging: messaging(), conversationId: id, sender: "owner" },
    conv.customer.whatsapp_number,
    tpl.template_name,
    tpl.language,
  );
  await getServiceSupabase()
    .from("conversations")
    .update({ last_owner_message_at: new Date().toISOString() })
    .eq("id", id);
  await audit(staff, "conversation.template", "conversation", id, { kind });
  revalidatePath("/dashboard", "layout");
}

export async function assignConversation(formData: FormData) {
  const staff = await requireAction("inbox");
  const id = String(formData.get("conversationId"));
  const to = String(formData.get("staffId") ?? "");
  await getServiceSupabase()
    .from("conversations")
    .update({ assigned_to: to || null })
    .eq("id", id);
  await audit(staff, "conversation.assign", "conversation", id, { to });
  revalidatePath("/dashboard", "layout");
}

/** Drafts a reply with Claude from the recent thread — returned to the owner to edit, never sent. */
export async function draftReply(conversationId: string): Promise<string> {
  await requireAction("inbox");
  const { data } = await getServiceSupabase()
    .from("messages")
    .select("sender, body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(15);
  const thread = (data ?? [])
    .reverse()
    .map((m) => `${m.sender === "customer" ? "Customer" : "Team"}: ${m.body}`)
    .join("\n");
  return suggestReply(
    `Recent conversation:\n${thread}\n\nDraft the next team reply.`,
  );
}

/** Sends a message to the customer in the booking context (used by booking actions). */
export async function notifyCustomerOfBooking(
  customerId: string,
  text: string,
) {
  const { sendToCustomer } =
    await import("@/lib/notifications/customerMessages");
  await sendToCustomer(customerId, text);
}
