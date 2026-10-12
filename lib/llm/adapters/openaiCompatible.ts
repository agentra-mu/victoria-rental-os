import type { z } from "zod";
import {
  LlmError,
  validateWithOneRetry,
  type GenerateOptions,
  type LLMProvider,
} from "../provider";

export interface OpenAICompatibleConfig {
  /** e.g. https://openrouter.ai/api/v1, https://api.groq.com/openai/v1, http://localhost:11434/v1 */
  baseUrl: string;
  /** Local servers (Ollama, llama.cpp) usually need none. */
  apiKey?: string;
  model: string;
  /** Send response_format: json_object. Turn off for servers that reject it. */
  jsonMode?: boolean;
  defaultTimeoutMs?: number;
  extraHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

/**
 * Talks to any server that implements POST {baseUrl}/chat/completions.
 * Uses plain JSON output validated with zod — no tool calling, no
 * provider-specific features.
 */
export function createOpenAICompatibleProvider(
  config: OpenAICompatibleConfig,
): LLMProvider {
  const doFetch = config.fetchImpl ?? fetch;
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  async function callRaw(
    prompt: string,
    options: GenerateOptions | undefined,
    retryHint?: string,
  ) {
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? config.defaultTimeoutMs ?? 4000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const messages = [
        ...(options?.system
          ? [{ role: "system", content: options.system }]
          : []),
        { role: "user", content: prompt },
        ...(retryHint ? [{ role: "user", content: retryHint }] : []),
      ];
      const res = await doFetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(config.extraHeaders ?? {}),
          ...(config.apiKey
            ? { Authorization: `Bearer ${config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0,
          max_tokens: options?.maxOutputTokens ?? 400,
          ...(config.jsonMode !== false
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
      });
      if (!res.ok) {
        throw new LlmError("HTTP", `LLM HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: data.choices?.[0]?.message?.content ?? "",
        usage: {
          inputTokens:
            data.usage?.prompt_tokens ?? Math.ceil(prompt.length / 4),
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof LlmError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new LlmError("TIMEOUT", `LLM timed out after ${timeoutMs}ms`);
      }
      throw new LlmError(
        "NETWORK",
        error instanceof Error ? error.message : "network error",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: "openai_compatible",
    model: config.model,
    available: true,
    async generateJson<T>(
      prompt: string,
      schema: z.ZodType<T>,
      options?: GenerateOptions,
    ) {
      const started = Date.now();
      const { value, usage } = await validateWithOneRetry(
        (hint) => callRaw(prompt, options, hint),
        schema,
      );
      return {
        value,
        usage,
        model: config.model,
        latencyMs: Date.now() - started,
      };
    },
  };
}
