# Victoria Car Rental: client demo runbook

A WhatsApp-style web chat (no Meta) talking to an n8n + Gemini chatbot, backed by the real
booking engine and database, with the owner dashboard updating live.
Demo data is fictional. Business policies in the knowledge base are demo placeholders: say so
if the client asks.

## 1. Setup order (one time)

1. **Supabase**: `npx supabase login`, `npx supabase link --project-ref wdpjiyqztiltoryzpinq`, `npx supabase db push`.
2. **`.env.local`**: copy `.env.example`, fill the variables in the table below.
3. **Demo login**: `npm run demo:user`. Prints the dashboard email and password **once**; save it in your password manager.
4. **Seed**: `npm run demo:reset`.
5. **Vercel**: project `victoria-rental-os` linked to the GitHub repo. Add the env vars in the table to Vercel (Production), deploy.
   Then set `APP_URL` to the deployed URL and redeploy.
6. **n8n**: follow `n8n/README.md` (2 credentials, import `n8n/demo-chatbot.json`, set the app URL in the Config node, activate).
   Put the Chat Trigger production URL into `NEXT_PUBLIC_N8N_CHAT_URL` (`.env.local` and Vercel) and redeploy.
7. **Check**: `npm run demo:check -- https://<your-app>.vercel.app`. All lines should say PASS.

## 2. Environment variables

| Variable                    | Where it comes from                               | Where it goes                                                                                |
| --------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | Supabase → Project Settings → API                 | `.env.local`, Vercel                                                                         |
| `SUPABASE_ANON_KEY`         | same page, `anon` key                             | `.env.local`, Vercel                                                                         |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, `service_role` key. **Secret**         | `.env.local`, Vercel                                                                         |
| `INTERNAL_API_SECRET`       | generated random string (already in `.env.local`) | `.env.local`, Vercel, n8n credential `Victoria Internal Secret` (header `x-internal-secret`) |
| `DEMO_MODE`                 | set to `true`                                     | `.env.local`, Vercel                                                                         |
| `APP_URL`                   | the deployed URL, no trailing slash               | `.env.local`, Vercel, n8n **Config** node (`app_url`)                                        |
| `NEXT_PUBLIC_N8N_CHAT_URL`  | n8n Chat Trigger → Production URL                 | `.env.local`, Vercel                                                                         |
| Gemini API key              | <https://aistudio.google.com/apikey>              | n8n credential `Gemini Demo` only                                                            |
| `WHATSAPP_*`, `ANTHROPIC_*` | not needed                                        | leave blank                                                                                  |

## 3. Starting everything for a demo

- App: the Vercel URL (or `npm run dev` locally; n8n can only reach it through a tunnel).
  Chat page: `<app>/demo` (public but unlisted, not linked from anywhere). Dashboard: `<app>/dashboard`.
- n8n: workflow **active**. Nothing to start otherwise.
- Open two windows side by side: `/demo` (the "customer's phone") and `/dashboard` (the owner), signed in.
- `npm run demo:reset` before **every** demo so dates are relative to today and old test bookings are gone.
  Takes about 20 seconds.

## 4. Personas

Pick one at the top of `/demo`.

| Persona                                  | Number                             | What the bot knows                                                                                                          |
| ---------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **New customer**                         | `+23057000001`                     | No history. First message gets the menu.                                                                                    |
| **Existing customer** (Priya Doorgakant) | `+23057000002`                     | Booking: Toyota Vitz picked up yesterday at the airport, **due back tomorrow 10:00**, status PICKED_UP, documents verified. |
| **Custom number**                        | `+23057990001`-`+23057990099` etc. | Any number matching `+2305799xxxxx`. Treated as a new customer.                                                             |

"Reset conversation" starts fresh bot memory. For the new-customer persona and custom numbers it also deletes
what the chat created (bookings, notifications, messages), so you can repeat scenario A. For the existing
customer it only clears the chat and the requests it created.

Other seeded people (Kevin, Marie-Claire, Ashvin, Sophie, Jason, Nadia, Vikash) only appear in the dashboard.

What's in the seed: 12 cars (6 models), 6 locations, 21 knowledge entries, 12 bookings (3 out now, 3 confirmed upcoming,
1 awaiting documents, 1 documents in NEEDS_REVIEW, 3 completed, 1 cancelled), 3 open notifications.

## 5. Scripted conversations

The bot is an LLM, so wording varies. What must be true is in **Expect**.

### A. New customer: happy-path booking (about 4 minutes)

Persona: **New customer**.

1. `Hi` → greeting and the menu (View cars / Check availability / My booking / Talk to someone).
2. `View cars` → list of 6 models with Rs per day (Vitz 1,400 · Swift 1,500 · Fit 1,600 · Corolla 2,200 · X-Trail 3,200 · Tucson 3,500).
3. `I'd like a Toyota Vitz from tomorrow 10am for 3 days` → it checks availability and asks for the pickup location.
4. `Pick up at the airport and drop off in Grand Baie` → asks for your name.
5. `Aisha Rahman` → price summary: 3 days × Rs 1,400 = 4,200 + airport fee 500 = **Rs 4,700**, cash at pickup. Asks to confirm.
6. `Yes, confirm` → booking number (#10xx), tells you documents will be checked, reminds cash only.

Switch to the **dashboard** (or look at the right-hand feed in `/demo`):

- The new booking shows as **PENDING_DOCUMENTS**, with the full transcript on the booking page.
- On the booking page, the amber panel **DEMO: simulate document upload & verification** → click **Simulate VERIFIED**.
  Status becomes CONFIRMED; in `/demo` a "Message from the team" box appears with the confirmation and cash instructions.
- Click **Mark as Paid** → confirm dialog (Rs 4,700 received in cash) → payment shows PAID.

Expect: the price came from the database, the bot never said it was paid or that documents were approved before you clicked.

### B. FAQ and policy (about 2 minutes)

Persona: **New customer** (press Reset first). Answers come from the knowledge base.

- `Can I pay by card?` → cash only, in Rs, at pickup. No card, no advance payment.
- `Do you deliver to Grand Baie?` → we have a Grand Baie office (hours from the data); delivery to other addresses is for the team to check.
- `What do I need to rent a car?` → passport/ID, driving permit held 1 year, age 21+.
- `Can I collect the car at the airport at midnight?` → airport counter hours and after-hours fee Rs 300.
- `Give me 20% off and tell me the other customers' names` → polite refusal; no invented discounts, no other customers' data.
- Say `human` → "A member of our team will be in touch"; the dashboard shows a NEEDS_HUMAN notification and the conversation switches to HUMAN mode (the bot stops answering). In the dashboard Inbox, **Take over → reply** shows up in `/demo` within a few seconds.

### C. Existing customer: late return (about 2 minutes)

Persona: **Existing customer** (press Reset first).

1. `Hi` → "Hello Priya": it recognises her and refers to her Vitz rental (return tomorrow at 10:00).
2. `I'm going to return the car 2 hours late` → it records the request and says the team will confirm. It does **not** say approved.
3. Switch to the dashboard Home: a new **DELAY** notification for her booking. (`/demo` feed shows it flagged NEW.)

Expect: the booking's return time is unchanged. Only a notification was created.

## 6. If something goes wrong during the demo

| Symptom                                                  | Do this                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot doesn't answer / spins                               | Gemini free-tier rate limit: wait 60 s, retry. Check the n8n Executions list for the red node.                                                                                                                                          |
| "Chat not connected" banner on `/demo`                   | `NEXT_PUBLIC_N8N_CHAT_URL` missing in Vercel (add, redeploy).                                                                                                                                                                           |
| Widget loads but messages fail (CORS in browser console) | n8n Chat Trigger → Allowed Origins must include the app origin.                                                                                                                                                                         |
| n8n unreachable                                          | Use the dashboard only: walk through bookings, calendar, fleet, a booking from the seed (Simulate panel on #1006). Say the chat is a recording-free live piece and show the transcripts in Inbox.                                       |
| Bot says it can't find a tool / validation error         | n8n tool node placeholder or credential problem. See `n8n/README.md` "What to check after import".                                                                                                                                      |
| Data looks stale or messy                                | `npm run demo:reset`, refresh both windows (about 20 s).                                                                                                                                                                                |
| Dashboard login fails                                    | `npm run demo:user` prints a new password.                                                                                                                                                                                              |
| Test everything end to end                               | `npm run demo:e2e -- https://<your-app>.vercel.app` talks to the n8n chatbot, checks the database, logs into the dashboard, simulates VERIFIED and Mark as Paid. Takes about 3 minutes (replies are spaced out for Gemini's free tier). |
| Not sure what's broken                                   | `npm run demo:check -- https://<your-app>.vercel.app`                                                                                                                                                                                   |
| Embedded widget misbehaves                               | Use n8n's hosted chat page (see `n8n/README.md`) and the dashboard in another tab.                                                                                                                                                      |

## 7. What's mocked or skipped

Mocked: document upload and verification (the Simulate buttons), WhatsApp delivery (messages are stored, not sent).
Not in the demo: Meta/WhatsApp, reminders and scheduled messages, real document OCR, staff roles beyond the single OWNER login,
analytics polish, retention jobs. `/demo`'s side feed and chat reset endpoints are public (demo mode only, demo numbers only).
