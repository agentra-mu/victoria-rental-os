# Victoria Car Rental — WhatsApp Booking & Operations System

Build plan and Claude Code prompts for a WhatsApp-first car rental booking and
operations system: WhatsApp as the customer interface, with a booking engine, customer
database, document verification and an owner dashboard behind it.

The product is not "an AI chatbot". It is **WhatsApp + booking engine + fleet management
+ customer database + document verification + operations dashboard**. The chatbot is the
interface.

## Repository contents

| Path | What it holds |
| --- | --- |
| `CLAUDE.md` | Project brief and hard rules that apply to all work in this repo |
| `docs/build-guide.md` | The full build guide — architecture, both builds, every component |
| `prompts/` | One Claude Code prompt per component, numbered in build order |
| `.env.example` | Environment variables the system needs |

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
orchestration only) · Claude API (conversation agent and document extraction) · WhatsApp
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
