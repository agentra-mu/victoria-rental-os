import type { z } from "zod";
import {
  LlmError,
  validateWithOneRetry,
  type GenerateOptions,
  type LLMProvider,
} from "../provider";

export interface MockProvider extends LLMProvider {
  /** Every prompt received, in order. */
  readonly calls: { prompt: string; options?: GenerateOptions }[];
  /** Queue the raw text the next call should return. */
  enqueue(...responses: (string | object | Error)[]): void;
}

/**
 * Test adapter. With `failOnCall` any call throws immediately (and is
 * recorded) — tests use it to prove a flow never reaches the LLM.
 */
export function createMockProvider(
  opts: { failOnCall?: boolean; model?: string } = {},
): MockProvider {
  const queue: (string | object | Error)[] = [];
  const calls: MockProvider["calls"] = [];
  return {
    name: "mock",
    model: opts.model ?? "mock-1",
    available: true,
    calls,
    enqueue(...responses) {
      queue.push(...responses);
    },
    async generateJson<T>(
      prompt: string,
      schema: z.ZodType<T>,
      options?: GenerateOptions,
    ) {
      calls.push({ prompt, options });
      if (opts.failOnCall) {
        throw new Error(`LLM was called unexpectedly: ${prompt.slice(0, 120)}`);
      }
      const started = Date.now();
      const { value, usage } = await validateWithOneRetry(async () => {
        const next = queue.shift();
        if (next === undefined) throw new LlmError("HTTP", "mock queue empty");
        if (next instanceof Error) throw next;
        return {
          text: typeof next === "string" ? next : JSON.stringify(next),
          usage: {
            inputTokens: Math.ceil(prompt.length / 4),
            outputTokens: 20,
          },
        };
      }, schema);
      return {
        value,
        usage,
        model: opts.model ?? "mock-1",
        latencyMs: Date.now() - started,
      };
    },
  };
}
