# Victoria Car Rental — WhatsApp Booking & Operations System

## What this is

A WhatsApp-first car rental booking and operations system. WhatsApp is the customer
interface; behind it sit a booking engine, customer database, document verification
and an owner dashboard.

## Core rules — these apply to all work in this repo

- **The database is the source of truth.** The AI chatbot never invents prices,
  availability, or booking state — it calls backend API functions.
- **Business logic** (pricing, availability, booking validation, status transitions,
  vehicle assignment) lives in `/lib/domain` as pure, unit-tested TypeScript, exposed
  via Next.js route handlers under `/app/api`. n8n only orchestrates.
- **The AI must never mark a payment as PAID.** Only an authenticated owner action can.
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

| Layer                     | Choice                                                |
| ------------------------- | ----------------------------------------------------- |
| Frontend / API            | Next.js (App Router, TypeScript, Tailwind) on Vercel  |
| Database / Auth / Storage | Supabase (Postgres, private Storage buckets)          |
| WhatsApp orchestration    | n8n (thin — no business logic)                        |
| AI                        | Claude API (conversation agent + document extraction) |
| Messaging                 | WhatsApp Business Cloud API (Meta)                    |

## Open questions — update this file when the rental company answers

- [ ] Rental-day rule: how are days counted, and is there a grace period?
- [ ] Late-return fee and minimum rental period
- [ ] Document retention period and who may view documents
- [ ] Location fees and after-hours pickup rules
- [ ] Which languages customers use most (English, French, Kreol)

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
- **Chatbot brain** is an n8n workflow (`n8n/demo-chatbot.json`, built by `npm run demo:n8n` from
  `n8n/system-prompt.md`) with Gemini, calling `/api/demo/tools/<tool>`. These are thin wrappers over
  the existing agent tool handlers (`lib/demo/tools.ts`). The customer comes from a fixed
  `whatsapp_number` set by n8n, never from the model. No demo tool can set PAID (tested).
- **Mocked:** document upload and verification (`Simulate VERIFIED / NEEDS_REVIEW` in the booking page),
  owner replies (stored to `messages`, shown in `/demo`).
- **Skipped:** Meta webhook/signature, templates, reminders/cron (`vercel.json` crons removed), real OCR,
  e2e, hardening. The Claude agent in `lib/agent` is unused in the demo.
- **Scripts:** `npm run demo:user` (demo login), `demo:reset` (wipe and reseed with dates relative to now),
  `demo:check` (smoke test), `demo:n8n` (regenerate the workflow).
