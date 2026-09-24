# Component 0 — Project setup and CLAUDE.md

Give Claude Code a persistent project brief first. Every prompt assumes `CLAUDE.md`
exists at the repo root.

## Prompt

```text
I'm building a WhatsApp car rental booking & operations system for a rental company in Mauritius. Set up the project foundation.

1. Create a Next.js (App Router, TypeScript, Tailwind) project structured for Vercel deployment, with Supabase as the database/auth/storage.
2. Create a CLAUDE.md at the repo root that captures these rules for all future work:
   - The database is the source of truth. The AI chatbot never invents prices, availability, or booking state — it calls backend API functions.
   - Business logic (pricing, availability, booking validation, status transitions, vehicle assignment) lives in /lib/domain as pure, unit-tested TypeScript, exposed via Next.js route handlers under /app/api. n8n only orchestrates.
   - The AI must never mark a payment as PAID. Only an authenticated owner action can.
   - Document verification never auto-rejects. Outcomes are VERIFIED or NEEDS_REVIEW only.
   - Identity documents are sensitive: private storage, signed short-lived URLs, audit logging on every access.
   - Currency is Mauritian Rupees (Rs), timezone Indian/Mauritius (UTC+4). Store timestamps in UTC, display in local time.
   - Booking statuses: ENQUIRY, CAR_SELECTED, DATES_SELECTED, PENDING_DOCUMENTS, DOCUMENTS_VERIFIED, CONFIRMED, PICKED_UP, RETURNED, COMPLETED, plus CANCELLED and NEEDS_HUMAN.
3. Set up: env var handling (.env.example with SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, INTERNAL_API_SECRET), Vitest for tests, ESLint/Prettier, and a README explaining local setup.
4. Server-side Supabase client using the service role key (never exposed to the browser) and a browser client using the anon key.

Don't build features yet. Show me the folder structure when done.
```
