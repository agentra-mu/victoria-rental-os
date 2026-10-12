# Deterministic bot — migration notes

The conversation agent (a Claude tool-calling loop that ran an LLM on every turn) was replaced by a
rule-based bot. An LLM is now an optional last-resort fallback behind a provider-agnostic interface, and
everything works with `LLM_ENABLED=false` (the default).

## What was built

| Area           | Where                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Orchestrator   | `lib/bot/handleTurn.ts` — layers in order: buttons → commands → FAQ → state machine → existing booking → (LLM) → menu             |
| State machine  | `lib/bot/flow.ts` (steps), `engine.ts` (re-prompt/escalation), `changeRequest.ts`, `actions.ts` (domain error → template)         |
| Parsers        | `lib/bot/parsers/` — date/time (`chrono-node` + own rules, Mauritius time), car & location fuzzy match, name, delay, language     |
| Keywords       | `lib/bot/lexicon.ts` — per language, edit to extend                                                                               |
| Text           | `lib/bot/templates/{en,fr}.ts` (typed — a missing French string is a compile error); IDs in `lib/bot/ids.ts`                      |
| LLM (optional) | `lib/llm/` — `LLMProvider` interface; adapters: OpenAI-compatible, none (default), mock (tests); gateway with caps/timeout/cache  |
| DB             | migration `20261012100000_deterministic_bot.sql`; adapters in `lib/db/botDb.ts`; production wiring in `lib/bot/deps.ts`           |
| Inbound        | `app/api/whatsapp/inbound` → `lib/whatsapp/inbound.ts` → `handleTurn` (n8n is unchanged: receive → call backend → send replies)   |
| Owner tools    | deterministic "Return to bot" digest (`lib/bot/digest.ts`); "Suggest reply" / "Summarise with AI" buttons only when the LLM is on |
| Observability  | `bot_turns`, `llm_calls`, `messages.handled_by`, `messages.generated_by`; Analytics page "Chatbot" section; `/dev/simulator`      |
| Demo           | `/demo` is now a built-in chat (`app/demo/Chat.tsx`, `/api/demo/chat/send`) running the same bot — no n8n, no Gemini              |

**Deleted:** `lib/agent/*` (runAgent loop, tools, system prompt, iteration cap, evals), `lib/demo/tools*`, `lib/demo/chat*`,
`/api/demo/tools`, `/api/demo/chat/{inbound,outbound}`, `n8n/demo-chatbot.json`, `n8n/system-prompt.md`, `n8n/README.md` (demo workflow
docs), `scripts/build-n8n-workflow.ts`, `vitest.evals.config.mts`, the `evals` and `demo:n8n` npm scripts, and the `@anthropic-ai/sdk`
and `@n8n/chat` dependencies. New dependency: `chrono-node`.

## Roll-out steps

1. `npx supabase login && npx supabase db push` (applies `20261012100000_deterministic_bot.sql`; it also fills aliases, keywords, intent
   keys and French text for the seeded locations / knowledge base — idempotent). `lib/db/types.ts` was **not** regenerated (needs the CLI
   against the live project); the new code uses untyped queries for the new columns, so run `npx supabase gen types` when convenient.
   **The SQL (migration, `search_knowledge`) could not be executed here — the sandbox has no Postgres and the hosted project was unreachable.** After pushing, sanity-check: `select * from search_knowledge('opening hours', 'en', 5);` and `select * from search_knowledge('horaires', 'fr', 5);` should return rows with scores between 0 and 1.
2. Remove `ANTHROPIC_API_KEY` / `NEXT_PUBLIC_N8N_CHAT_URL` from Vercel; nothing else is required. Optionally set the `LLM_*` variables.
3. Deactivate/delete the old n8n _demo chatbot_ workflow. `whatsapp-inbound.json` needs no change.
4. Conversations in flight: the old agent's `conversations.state` is read tolerantly; a customer mid-booking restarts at the menu
   (an existing draft is reused if they pick the same car again).

`n8n/whatsapp-inbound.json` was checked and is already thin: Meta webhook → immediate 200 → normalise payload → `POST /api/whatsapp/inbound` →
send each returned reply (text / buttons / list) → optional owner ping. No branching or business logic lives in n8n.

## Behaviour changes customers/owners will notice

- **Free text is narrower.** A message that matches no rule, FAQ entry or step answer gets "Sorry, I didn't understand" + the menu.
  Two such messages in a row hand the chat to a person (`BOT_UNKNOWN_STREAK_LIMIT`) — this also applies with the LLM off. Review
  _Analytics → Top unrecognised phrases_ weekly and add rules (lexicon) or knowledge-base entries.
- **Dates never get guessed.** Missing am/pm ("9"), `03/04`-style dates (day/month vs month/day), and dates in the past produce a
  clarifying question with buttons. `10:00` also asks morning/evening; `10am`, `22:00`, `17h` don't. A date like `12/10` is asked
  unless only one reading is in the future.
- **The booking is collected step by step** (car → pickup date/time → return → pickup location → drop-off → name → summary → confirm); a
  range ("12 to 17 Oct") or "5 days" skips ahead. Back/Change buttons set the step directly.
- **Answers to a question mid-booking** (e.g. opening hours) are followed by the current step's prompt, so the flow resumes.
- **"HUMAN" detection is looser** (also "I want to talk to someone", "parler à quelqu'un"; up to 10 words) but never fires on button IDs.
- **Statements about payment** ("I already paid") are never confirmed; the owner is notified (`OTHER` notification) and the bot repeats
  "cash on collection". Accident/damage/theft reports and "I can't pay cash" escalate straight to a person (`NEEDS_HUMAN` / `CASH_ISSUE`).
- **Change requests** (delay, extension, pickup change, cancellation of a _confirmed_ booking) always show a confirmation step and end with
  "sent to our team — not approved yet". The booking itself is never edited by the bot.
- **Price lines in French summaries** are translated by pattern from the engine's English labels (`frLabel`); a new engine label would show
  in English until added there.
- `lib/domain/takeover.ts`: the transcript passed to the hand-back summariser now includes `[timestamp]` per line (needed for the digest).
  `lib/whatsapp/format.ts`: `formatMauritiusDateTime` takes an optional locale. No other `/lib/domain` change.

## What could not be made deterministic

- **Free-form language understanding** ("la petite Toyota pas chère pour le weekend"): only the optional LLM can try this, and its output
  is accepted only if the same parsers accept it.
- **Questions outside the knowledge base**: answered only by the optional grounded-answer call (citing KB entries; numbers must appear
  in the cited entries) — otherwise escalated.
- **Kreol Morisien** is not supported (English/French only, per scope). To add a language: extend `Lang` in `lib/bot/types.ts`, then the
  type errors list every lexicon array and template to fill in (`templates/<lang>.ts`).
- **Document extraction/verification** was out of scope and is untouched (still the NEEDS_REVIEW stub in `lib/verification`).
- **Calibration of the FTS threshold** (`BOT_FAQ_MIN_SCORE`) needs real data; the default (0.3) is a starting point. Keyword/intent rules
  answer the common questions without FTS.

## Deviations from the original plan

- No `load_turn_context` RPC: the customer + conversation come from one joined read, bookings are loaded lazily only when needed, and
  independent writes (state, language, turn log) run in parallel. Live round-trip timing could not be measured (the hosted Supabase host
  was unreachable from this environment); the tests assert < 300 ms of server time with in-memory data.
- KB French text is two columns (`question_fr`, `answer_fr`) rather than a translations table (only two languages).
- The LLM is never called from inside a booking step's parse failure (a failed parse is always a templated re-prompt) — this keeps
  prompt-injection at free-text steps inert and the happy path at zero calls. It is reached from the menu-level steps and for questions.
- Extra tables/columns beyond the brief: `bot_turns` (per-turn layer, timing, parsed values, unrecognised text), `llm_calls.customer_id`,
  `messages.generated_by`.

## Configuration

| Variable                                                                        | Default       | Meaning                                                                                      |
| ------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------- |
| `LLM_ENABLED`                                                                   | `false`       | Master switch for the optional fallback and the owner AI buttons                             |
| `LLM_PROVIDER`                                                                  | `none`        | `none` or `openai_compatible` (aliases openai/openrouter/groq/gemini/ollama behave the same) |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`                                      | —             | Endpoint, model name, key (empty for local servers)                                          |
| `LLM_JSON_MODE`                                                                 | `true`        | Send `response_format: json_object`; set `false` if the server rejects it                    |
| `LLM_TIMEOUT_MS`                                                                | `4000`        | Per-call timeout; on timeout the bot shows the menu                                          |
| `LLM_MAX_CALLS_PER_CONVERSATION_PER_DAY` / `LLM_MAX_CALLS_PER_CUSTOMER_PER_DAY` | `6` / `15`    | Rolling 24 h caps (counted from `llm_calls`)                                                 |
| `LLM_MAX_INPUT_CHARS`                                                           | `1500`        | Customer text is cut to this before reaching the model                                       |
| `LLM_CACHE_TTL_MS`                                                              | 24 h          | Cache of validated results for identical normalised questions                                |
| `BOT_MAX_REPROMPTS`                                                             | `2`           | Re-prompts per step before the "stuck" buttons (then a human)                                |
| `BOT_FUZZY_THRESHOLD` / `BOT_FUZZY_MARGIN`                                      | `0.8` / `0.1` | Car & location matching: minimum similarity / lead over the runner-up                        |
| `BOT_FAQ_MIN_SCORE` / `BOT_FAQ_MARGIN`                                          | `0.3` / `0.1` | FTS: minimum top score / lead over the second hit                                            |
| `BOT_UNKNOWN_STREAK_LIMIT`                                                      | `2`           | Consecutive not-understood messages before NEEDS_HUMAN                                       |
| `BOT_NAME_MAX_TOKENS`                                                           | `5`           | A "name" with more words is rejected                                                         |

Hard-coded: max 1 LLM call per turn; cache TTL for fleet/locations/knowledge base is 60 s (`lib/bot/cache.ts`, cleared immediately when
the owner saves a change on that server instance); static replies (menu) are built once per language by the template module.
