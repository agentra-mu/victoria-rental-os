import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { createSupabaseDomainDb } from "@/lib/db/domainDb";

export {
  checkInternalSecret,
  isoDateTime,
  jsonError,
  jsonOk,
  readJsonBody,
} from "@/lib/api/http";

/** Every /app/api/engine/* route talks to Postgres through this — n8n only orchestrates (CLAUDE.md). */
export function getEngineDb() {
  return createSupabaseDomainDb(getServiceSupabase());
}
