import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createChangeRequestPort,
  createSupabaseCatalog,
  createSupabaseLlmLog,
  createSupabaseTurnLog,
} from "@/lib/db/botDb";
import { createSupabaseDomainDb } from "@/lib/db/domainDb";
import { createSupabaseMessagingDb } from "@/lib/db/messagingDb";
import { requireEnv } from "@/lib/env";
import { createLlmProviderFromEnv } from "@/lib/llm";
import { createLlmGateway } from "@/lib/llm/guard";
import type { BotDeps } from "./ports";

/** Production wiring for the bot. With LLM_ENABLED unset/false the gateway is simply absent. */
export function createBotDeps(client: SupabaseClient): BotDeps {
  const provider = createLlmProviderFromEnv();
  return {
    domainDb: createSupabaseDomainDb(client as never),
    messaging: createSupabaseMessagingDb(client as never),
    catalog: createSupabaseCatalog(client),
    requestChange: createChangeRequestPort(client),
    llm: provider.available
      ? createLlmGateway({ provider, log: createSupabaseLlmLog(client) })
      : null,
    turnLog: createSupabaseTurnLog(client),
    appUrl: () => requireEnv(process.env, ["APP_URL"]).APP_URL,
  };
}
