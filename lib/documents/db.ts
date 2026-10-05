import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { createSupabaseDomainDb } from "@/lib/db/domainDb";
import { createSupabaseMessagingDb } from "@/lib/db/messagingDb";

export const DOCUMENTS_BUCKET = "documents";

/** Wiring for the upload page and route handler — service-role only, never exposed to the browser (CLAUDE.md). */
export function getDocumentsDeps() {
  const client = getServiceSupabase();
  return {
    domainDb: createSupabaseDomainDb(client),
    messaging: createSupabaseMessagingDb(client),
    storage: client.storage.from(DOCUMENTS_BUCKET),
  };
}
