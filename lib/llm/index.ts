import { createOpenAICompatibleProvider } from "./adapters/openaiCompatible";
import { noneProvider } from "./adapters/none";
import type { LLMProvider } from "./provider";

export type { LLMProvider, LlmPurpose, GenerateOptions } from "./provider";

/** Reads LLM_ENABLED, LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, LLM_BASE_URL, LLM_JSON_MODE, LLM_TIMEOUT_MS. */
export type LlmEnv = Record<string, string | undefined>;

/** True only when the owner explicitly turned the optional fallback on. */
export function isLlmEnabled(env: LlmEnv = process.env): boolean {
  return env.LLM_ENABLED === "true" && providerKind(env) !== "none";
}

function providerKind(env: LlmEnv): "none" | "openai_compatible" {
  const p = (env.LLM_PROVIDER ?? "none").toLowerCase();
  return p === "none" || p === "" ? "none" : "openai_compatible";
}

/**
 * Adapter selected by env: LLM_PROVIDER = none (default) | openai_compatible
 * (also accepted: openai, openrouter, groq, gemini, ollama — all speak the
 * same OpenAI-compatible protocol; only LLM_BASE_URL differs).
 */
export function createLlmProviderFromEnv(
  env: LlmEnv = process.env,
): LLMProvider {
  if (!isLlmEnabled(env)) return noneProvider;
  if (!env.LLM_BASE_URL || !env.LLM_MODEL) return noneProvider;
  return createOpenAICompatibleProvider({
    baseUrl: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY || undefined,
    model: env.LLM_MODEL,
    jsonMode: env.LLM_JSON_MODE !== "false",
    defaultTimeoutMs: env.LLM_TIMEOUT_MS ? Number(env.LLM_TIMEOUT_MS) : 4000,
    // OpenRouter shows these in its dashboard/rankings; harmless elsewhere.
    extraHeaders: { "X-Title": "Victoria Car Rental" },
  });
}
