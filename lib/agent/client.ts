import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "@/lib/env";
import { DEFAULT_MODEL } from "./config";
import type { ModelClient } from "./ports";

/** The model name is configurable via env (prompts/05-ai-conversation-agent.md) without a code change. */
export function getAgentModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

/** Thin adapter from the real Anthropic SDK to the ModelClient port — see /lib/agent/ports.ts for why this indirection exists. */
export function createAnthropicModelClient(): ModelClient {
  const { ANTHROPIC_API_KEY } = requireEnv(process.env, ["ANTHROPIC_API_KEY"]);
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  return {
    async createMessage(params) {
      return anthropic.messages.create({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.system,
        messages: params.messages,
        tools: params.tools,
      });
    },
  };
}
