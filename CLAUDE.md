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
