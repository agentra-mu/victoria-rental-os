import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { createSupabaseMessagingDb } from "@/lib/db/messagingDb";
import { sendTextMessage } from "@/lib/whatsapp/send";
import { COMPANY_NAME } from "@/lib/agent/config";

export const customerMessages = {
  documentsVerified: (totalRs: number) =>
    `Thank you — your documents are verified and your booking with ${COMPANY_NAME} is confirmed. Your rental total is Rs ${totalRs}. Payment is made by cash when collecting your vehicle. If you have any difficulty paying by cash, reply HUMAN.`,
  reupload: (url: string) =>
    `We couldn't use the documents you sent. Please upload them again here: ${url}`,
  cancelled: (n: number) =>
    `Your booking #${n} with ${COMPANY_NAME} has been cancelled. Reply any time to book again.`,
};

export async function sendToCustomer(
  customerId: string,
  text: string,
): Promise<void> {
  const messaging = createSupabaseMessagingDb(getServiceSupabase() as never);
  const customer = await messaging.getCustomerById(customerId);
  if (!customer) return;
  const conversation = await messaging.getOrCreateConversation(customerId);
  await sendTextMessage(
    { messaging, conversationId: conversation.id, sender: "owner" },
    customer.whatsappNumber,
    text,
  );
}

export const moreMessages = {
  rejected: (n: number) =>
    `Unfortunately we couldn't accept the documents for booking #${n}. A member of our team will contact you shortly to help.`,
};
