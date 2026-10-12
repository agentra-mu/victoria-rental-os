/**
 * Checks the LLM settings in .env.local actually work. Run: npm run llm:check
 * Sends one tiny request through the same adapter the bot uses and prints the result.
 */
import { z } from "zod";
import { createOpenAICompatibleProvider } from "../lib/llm/adapters/openaiCompatible.ts";

const { LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, LLM_JSON_MODE, LLM_TIMEOUT_MS } =
  process.env;
if (!LLM_BASE_URL || !LLM_MODEL || !LLM_API_KEY) {
  console.error(
    "FAIL  Set LLM_BASE_URL, LLM_MODEL and LLM_API_KEY in .env.local (paste your key after LLM_API_KEY=).",
  );
  process.exit(1);
}

const provider = createOpenAICompatibleProvider({
  baseUrl: LLM_BASE_URL,
  apiKey: LLM_API_KEY,
  model: LLM_MODEL,
  jsonMode: LLM_JSON_MODE !== "false",
  defaultTimeoutMs: Number(LLM_TIMEOUT_MS) || 10000,
  extraHeaders: { "X-Title": "Victoria Car Rental" },
});

const schema = z.object({
  intent: z.string(),
  car: z.string().optional(),
  pickup_datetime: z.string().optional(),
  duration: z.string().optional(),
});

try {
  const r = await provider.generateJson(
    `Return JSON {"intent": "view_cars", "car": <car name>, "pickup_datetime": <phrase>, "duration": <phrase>} for this message, copying phrases literally:\n<customer_message>\nCould I get the Vitz from tomorrow 9am for 3 days?\n</customer_message>`,
    schema,
    { system: "You output only a JSON object." },
  );
  console.log(`PASS  ${provider.model} answered in ${r.latencyMs} ms`);
  console.log(JSON.stringify(r.value));
} catch (error) {
  console.error(
    `FAIL  ${error instanceof Error ? error.message : String(error)}`,
  );
  console.error(
    "Tips: HTTP 401 = wrong key · 404/400 = wrong model name or LLM_JSON_MODE · 429 = free-tier rate limit · TIMEOUT = raise LLM_TIMEOUT_MS",
  );
  process.exit(1);
}
