# Victoria Car Rental — WhatsApp Booking & Operations System

## What this is

A WhatsApp-first car rental booking and operations system. WhatsApp is the customer
interface; behind it sit a booking engine, customer database, document verification
and an owner dashboard.

## Core rules — these apply to all work in this repo

- **Conversation logic is deterministic. An LLM is an optional last-resort fallback behind the provider interface; new conversational capabilities must be implemented with rules/templates first; every LLM call is logged and capped; the system must work with LLM_ENABLED=false.**
- **The database is the source of truth.** The chatbot never invents prices,
  availability, or booking state — it calls backend functions in `/lib/domain`.
- **Business logic** (pricing, availability, booking validation, status transitions,
  vehicle assignment) lives in `/lib/domain` as pure, unit-tested TypeScript, exposed
  via Next.js route handlers under `/app/api`. n8n only orchestrates.
- **The bot (and any LLM) must never mark a payment as PAID.** Only an authenticated owner action can.
- **Document verification never auto-rejects.** Outcomes are `VERIFIED` or
  `NEEDS_REVIEW` only. A human rejects.
- **Identity documents are sensitive:** private storage, signed short-lived URLs,
  audit logging on every access.
- **Currency** is Mauritian Rupees (Rs). **Timezone** is `Indian/Mauritius` (UTC+4).
  Store timestamps in UTC, display in local time.

## Booking statuses

```
ENQUIRY → CAR_SELECTED → DATES_SELECTED → PENDING_DOCUMENTS →
DOCUMENTS_VERIFIED → CONFIRMED → PICKED_UP → RETURNED → COMPLETED
```

Plus `CANCELLED` and `NEEDS_HUMAN`, reachable from any active state.

## Stack

| Layer                     | Choice                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- |
| Frontend / API            | Next.js (App Router, TypeScript, Tailwind) on Vercel                          |
| Database / Auth / Storage | Supabase (Postgres, private Storage buckets)                                  |
| WhatsApp orchestration    | n8n (thin — no business logic)                                                |
| Conversation              | Deterministic bot in `/lib/bot` (state machine, parsers, templates)           |
| Optional LLM              | `/lib/llm` provider interface; any OpenAI-compatible endpoint; off by default |
| Messaging                 | WhatsApp Business Cloud API (Meta)                                            |

## Open questions — update this file when the rental company answers

- [ ] Rental-day rule: how are days counted, and is there a grace period?
- [ ] Late-return fee and minimum rental period
- [ ] Document retention period and who may view documents
- [ ] Location fees and after-hours pickup rules
- [ ] Which languages customers use most (English, French, Kreol)

## Chatbot architecture (`/lib/bot`)

`handleTurn(deps, conversationId, message)` runs these layers in order and stops at the first that
handles the message:

1. **Structured IDs** — button/list replies carry machine IDs (`lib/bot/ids.ts`: `menu:view_cars`,
   `car:<id>`, `loc:<id>`, `confirm:yes`, `req:delay`, …). Routed directly, no text interpretation.
2. **Global commands** — HUMAN, MENU, CANCEL, STOP/START, BACK/CHANGE, YES/NO, thanks, greetings
   (`lib/bot/lexicon.ts`, English + French, case/accent-insensitive).
3. **FAQ** — keyword/intent rules, then Postgres full-text search with a score threshold and a margin
   over the runner-up; the stored answer is sent verbatim.
4. **State machine** (`lib/bot/flow.ts`, step in `conversations.state.step`) — each step has
   `prompt` / `parse` / `onValid`; parsers are deterministic (`lib/bot/parsers/*`). Max 2 re-prompts
   per step, then buttons, then a human. Domain error codes map to templates (`actions.ts`).
5. **Existing booking** — status card from the DB; delay/extension/pickup change/cancel create a
   _change request_ for the owner and never edit the booking or promise approval.
6. **LLM understanding** (`lib/bot/layers/understand.ts`, only if `LLM_ENABLED=true`) — reads free-form
   text the rules couldn't: classifies it and extracts details ("Vitz tomorrow 9am for 3 days from the
   airport"), which are pushed through the SAME step parsers; or gives a grounded knowledge answer. The
   model never writes customer text (except a grounded KB answer), has no tools and no write access.
   Max 1 call per turn, daily caps per conversation/customer, timeout, 24h cache. Without a model the
   rules read whole sentences themselves (`lib/bot/signals.ts`) and otherwise show the menu.

All customer-facing text lives in typed templates (`lib/bot/templates/{en,fr}.ts`); French strings are
listed in `NEEDS_NATIVE_REVIEW.md`. The only non-template text is a grounded KB answer.
Bot code may only change bookings through the whitelisted `/lib/domain` functions (enforced by
`lib/domain/paymentGuard.test.ts`). Knobs and behaviour changes: `MIGRATION_NOTES.md`.

## Environment variables

See `.env.example`. Validate with `requireEnv` from `lib/env.ts`. Use the service-role
client (`lib/supabase/server.ts`) only on the server.

## Commands

`npm test`, `npm run lint`, `npm run typecheck`, `npm run format:check`. All must pass
before a component counts as done.

## Next.js version

@AGENTS.md

## How to use this repo

`docs/build-guide.md` is the full build guide. `prompts/` holds one Claude Code
prompt per component, numbered in the order they should be run. Run one component
per session.

## Demo mode

This repo currently runs as a client **demo** (no Meta/WhatsApp). Full runbook: `docs/DEMO.md`.

- `DEMO_MODE=true` turns on: the `/demo` web chat page, `/api/demo/*`, the DEMO badge and the
  "simulate documents" panel in the dashboard, and WhatsApp sends become "store the message only"
  (`lib/whatsapp/send.ts`). Without the flag, `/api/demo/*` and `/demo` return 404.
- **Chatbot** is the same deterministic bot as production: `/demo` posts to `/api/demo/chat/send`, which
  runs `handleInboundMessage` → `handleTurn` (no n8n, no LLM needed). The customer comes from a fixed
  demo `whatsapp_number`. The bot cannot set PAID (tested).
- **Mocked:** document upload and verification (`Simulate VERIFIED / NEEDS_REVIEW` in the booking page),
  owner replies (stored to `messages`, shown in `/demo`).
- **Skipped:** Meta webhook/signature, templates, reminders/cron (`vercel.json` crons removed), real OCR,
  e2e, hardening.
- **Scripts:** `npm run demo:user` (demo login), `demo:reset` (wipe and reseed with dates relative to now),
  `demo:check` (smoke test), `demo:e2e` (live end-to-end test).
