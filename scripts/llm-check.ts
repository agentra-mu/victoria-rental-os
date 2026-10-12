/**
 * Checks the LLM settings in .env.local actually work. Run: npm run llm:check
 * Sends one tiny request the same way the bot's adapter does and prints the result.
 */
const { LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, LLM_JSON_MODE, LLM_TIMEOUT_MS } =
  process.env;
if (!LLM_BASE_URL || !LLM_MODEL || !LLM_API_KEY) {
  console.error(
    "FAIL  Set LLM_BASE_URL, LLM_MODEL and LLM_API_KEY in .env.local (paste your key after LLM_API_KEY=).",
  );
  process.exit(1);
}

const started = Date.now();
try {
  const res = await fetch(
    `${LLM_BASE_URL.replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST",
      signal: AbortSignal.timeout(Number(LLM_TIMEOUT_MS) || 10000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM_API_KEY}`,
        "X-Title": "Victoria Car Rental",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0,
        max_tokens: 200,
        ...(LLM_JSON_MODE !== "false"
          ? { response_format: { type: "json_object" } }
          : {}),
        messages: [
          { role: "system", content: "You output only a JSON object." },
          {
            role: "user",
            content:
              'Return JSON {"intent": "view_cars", "car": <car name>, "pickup_datetime": <phrase>, "duration": <phrase>} for this message, copying phrases literally:\n<customer_message>\nCould I get the Vitz from tomorrow 9am for 3 days?\n</customer_message>',
          },
        ],
      }),
    },
  );
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  const text = (
    JSON.parse(body) as { choices?: { message?: { content?: string } }[] }
  ).choices?.[0]?.message?.content;
  console.log(`PASS  ${LLM_MODEL} answered in ${Date.now() - started} ms`);
  console.log(text);
} catch (error) {
  console.error(
    `FAIL  ${error instanceof Error ? error.message : String(error)}`,
  );
  console.error(
    "Tips: 401 = wrong key · 404/400 = wrong model name (or set LLM_JSON_MODE=false) · 429 = free-tier rate limit · timeout = raise LLM_TIMEOUT_MS",
  );
  process.exit(1);
}

export {};
