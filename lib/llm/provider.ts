import type { z } from "zod";

/** Why a call was made — the llm_calls.purpose column. */
export type LlmPurpose =
  | "classify"
  | "kb_answer"
  | "doc_extraction"
  | "owner_summary"
  | "owner_suggest";

export interface GenerateOptions {
  system?: string;
  maxOutputTokens?: number;
  /** Abort the request after this long. */
  timeoutMs?: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateResult<T> {
  value: T;
  usage: LlmUsage;
  model: string;
  latencyMs: number;
}

export type LlmErrorCode =
  "DISABLED" | "TIMEOUT" | "HTTP" | "INVALID_JSON" | "NETWORK";

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  constructor(code: LlmErrorCode, message: string) {
    super(message);
    this.name = "LlmError";
    this.code = code;
  }
}

/**
 * The only way the app talks to a language model. Deliberately tiny: plain
 * prompt in, schema-validated JSON out. No tool calling, no streaming, no
 * vendor-specific features — so any OpenAI-compatible endpoint (hosted free
 * tier or a local Ollama / llama.cpp / vLLM) works by changing env vars.
 */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  /** False for the "none" adapter — callers skip the LLM layer entirely. */
  readonly available: boolean;
  generateJson<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: GenerateOptions,
  ): Promise<GenerateResult<T>>;
}

/** Pulls the first JSON object out of model text (tolerates code fences and chatter around it). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new LlmError("INVALID_JSON", "Model did not return valid JSON");
  }
}

/**
 * Shared by adapters: parse + zod-validate the raw text, retrying the model
 * call ONCE if it produced invalid JSON or a schema mismatch.
 */
export async function validateWithOneRetry<T>(
  callRaw: (retryHint?: string) => Promise<{ text: string; usage: LlmUsage }>,
  schema: z.ZodType<T>,
): Promise<{ value: T; usage: LlmUsage }> {
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callRaw(
      attempt === 0
        ? undefined
        : "Your previous reply was not valid JSON for the required shape. Reply again with ONLY the JSON object.",
    );
    usage.inputTokens += raw.usage.inputTokens;
    usage.outputTokens += raw.usage.outputTokens;
    try {
      const parsed = schema.safeParse(extractJson(raw.text));
      if (parsed.success) return { value: parsed.data, usage };
      lastError = new LlmError("INVALID_JSON", parsed.error.message);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof LlmError
    ? lastError
    : new LlmError("INVALID_JSON", "Model output failed validation");
}
