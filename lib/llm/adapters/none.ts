import { LlmError, type LLMProvider } from "../provider";

/** Default adapter: LLM disabled. The bot runs entirely on rules and templates. */
export const noneProvider: LLMProvider = {
  name: "none",
  model: "none",
  available: false,
  async generateJson() {
    throw new LlmError("DISABLED", "LLM is disabled");
  },
};
