# Victoria Car Rental — WhatsApp Booking & Operations System

Build plan and Claude Code prompts for a WhatsApp-first car rental booking and
operations system: WhatsApp as the customer interface, with a booking engine, customer
database, document verification and an owner dashboard behind it.

The product is not "an AI chatbot". It is **WhatsApp + booking engine + fleet management

- customer database + document verification + operations dashboard**. The chatbot is the
  interface.

## Repository contents

| Path                  | What it holds                                                     |
| --------------------- | ----------------------------------------------------------------- |
| `CLAUDE.md`           | Project brief and hard rules that apply to all work in this repo  |
| `docs/build-guide.md` | The full build guide — architecture, both builds, every component |
| `prompts/`            | One Claude Code prompt per component, numbered in build order     |
| `.env.example`        | Environment variables the system needs                            |

## Local setup

Requires Node 22+ (the Codespace runs Node 24) and Docker for the local Supabase stack.

```bash
npm install
cp .env.example .env.local        # then fill in values
npx supabase start                # local Postgres, Auth, Storage (Docker)
npx supabase status               # prints the local URL, anon key and service role key
npm run dev                       # http://localhost:3000
```

| Script                            | What it does                                       |
| --------------------------------- | -------------------------------------------------- |
| `npm run dev` / `build` / `start` | Next.js                                            |
| `npm test` / `test:watch`         | Vitest (`**/*.test.ts`)                            |
| `npm run lint`                    | ESLint (Next.js rules + Prettier compatibility)    |
| `npm run typecheck`               | Generates Next.js route types, then `tsc --noEmit` |
| `npm run format` / `format:check` | Prettier                                           |

The Supabase CLI is a dev dependency, so run it as `npx supabase …`.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are copied into the browser bundle as
`NEXT_PUBLIC_*` values by `next.config.ts` at build time. Every other variable,
including the service role key, stays on the server.

## The two builds

**Build 1 (trial / MVP)** proves the company can take bookings through WhatsApp without
the owner handling every enquiry: FAQ, fleet display, car selection, dates, locations,
booking summary, document upload with basic verification, cash-payment instructions,
human escalation and a functional dashboard.

**Build 2 (production)** adds physical vehicle tracking and assignment, a real
availability engine, locations management, a fleet calendar, a conversation inbox with
human takeover, delay and extension workflows, automated reminders, analytics, audit
logs and staff roles.

## Stack

Next.js on Vercel · Supabase (Postgres, Auth, private Storage) · n8n (WhatsApp
orchestration only) · deterministic bot in `/lib/bot` with an optional LLM fallback · WhatsApp
Business Cloud API.

## How to use this

1. Read `CLAUDE.md` and `docs/build-guide.md`.
2. Run the prompts in `prompts/` in order, one component per Claude Code session:

   ```
   00 → 01 → 02 → 03 → 10 → 04 → 05 → 06 → 07 → 08 → 09 → 11 → 12 → 20   (Build 1)
   13 → 14 → 16 → 15 → 17 → 18 → 19                                       (Build 2)
   ```

   Component 10 (dashboard) is pulled forward so there is a way to see the data early.

3. Ask Claude Code for a plan before writing code on the larger components (02, 05, 08, 16).
4. Update `CLAUDE.md` whenever the rental company answers one of the open questions.

## Three decisions to settle before coding

1. **Physical vehicle records from day one**, even in the trial. Availability must be a
   date-overlap check against bookings, not a static Available/Booked column.
2. **The rental-day rule.** How days are counted, and whether a late return adds a day.
   Encode it in one pricing function.
3. **WhatsApp's 24-hour rule.** Reminders fall outside the free-form window and need
   pre-approved template messages — submit them to Meta early.

## Optional LLM (off by default)

The chatbot is rule-based and complete without any model (`LLM_ENABLED=false`). If you want a model to
understand free text the rules couldn't read (whole sentences, odd phrasing, other wording), point the provider interface (`/lib/llm`) at any
**OpenAI-compatible** endpoint — nothing vendor-specific is used (no tool calling; plain JSON output
validated with zod, one automatic retry).

```bash
# Free tier, hosted (examples — check each provider's current free models and limits):
LLM_ENABLED=true  LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://openrouter.ai/api/v1         LLM_MODEL=meta-llama/llama-3.3-70b-instruct:free   LLM_API_KEY=sk-or-...
# or Groq:   LLM_BASE_URL=https://api.groq.com/openai/v1                       LLM_MODEL=llama-3.1-8b-instant
# or Gemini: LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai   LLM_MODEL=gemini-2.0-flash
# Local (Ollama, llama.cpp server, vLLM) — no key, no limits, runs on your own machine:
LLM_BASE_URL=http://localhost:11434/v1            LLM_MODEL=qwen2.5:7b      LLM_API_KEY=
```

Free tiers have **rate limits** (requests per minute/day) and may change or disappear, which is why the
bot caps itself: at most 1 call per message, 30 per conversation and 60 per customer per day, a 4 s
timeout, and a 24 h cache; when a cap, timeout or error hits, the customer simply gets the menu and
"Talk to someone". Every call is logged in `llm_calls` and visible under Dashboard → Analytics.
Some small models ignore JSON mode — set `LLM_JSON_MODE=false` if the server rejects `response_format`.
See `MIGRATION_NOTES.md` for every setting.
