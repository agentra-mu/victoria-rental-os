# Victoria Car Rental: client demo runbook

A WhatsApp-style web chat (no Meta) talking to the real rule-based bot (`/lib/bot`), backed by the real
booking engine and database, with the owner dashboard updating live. No n8n, no AI key and no per-message
cost: replies take milliseconds.
Demo data is fictional. Business policies in the knowledge base are demo placeholders: say so
if the client asks.

## 1. Setup order (one time)

1. **Supabase**: `npx supabase login`, `npx supabase link --project-ref wdpjiyqztiltoryzpinq`, `npx supabase db push`.
2. **`.env.local`**: copy `.env.example`, fill the variables in the table below.
3. **Demo login**: `npm run demo:user`. Prints the dashboard email and password **once**; save it in your password manager.
4. **Seed**: `npm run demo:reset`.
5. **Vercel**: project `victoria-rental-os` linked to the GitHub repo. Add the env vars in the table to Vercel (Production), deploy.
   Then set `APP_URL` to the deployed URL and redeploy.
6. **Check**: `npm run demo:check -- https://<your-app>.vercel.app`. All lines should say PASS.

## 2. Environment variables

| Variable                    | Where it comes from                               | Where it goes                     |
| --------------------------- | ------------------------------------------------- | --------------------------------- |
| `SUPABASE_URL`              | Supabase → Project Settings → API                 | `.env.local`, Vercel              |
| `SUPABASE_ANON_KEY`         | same page, `anon` key                             | `.env.local`, Vercel              |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, `service_role` key. **Secret**         | `.env.local`, Vercel              |
| `INTERNAL_API_SECRET`       | generated random string (already in `.env.local`) | `.env.local`, Vercel              |
| `DEMO_MODE`                 | set to `true`                                     | `.env.local`, Vercel              |
| `APP_URL`                   | the deployed URL, no trailing slash               | `.env.local`, Vercel              |
| `WHATSAPP_*`, `LLM_*`       | not needed                                        | leave blank (`LLM_ENABLED=false`) |

## 3. Starting everything for a demo

- App: the Vercel URL (or `npm run dev` locally).
  Chat page: `<app>/demo` (public but unlisted, not linked from anywhere). Dashboard: `<app>/dashboard`.
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

"Reset conversation" starts a fresh chat. For the new-customer persona and custom numbers it also deletes
what the chat created (bookings, notifications, messages), so you can repeat scenario A. For the existing
customer it only clears the chat and the requests it created.

Other seeded people (Kevin, Marie-Claire, Ashvin, Sophie, Jason, Nadia, Vikash) only appear in the dashboard.

What's in the seed: 12 cars (6 models), 6 locations, 21 knowledge entries, 12 bookings (3 out now, 3 confirmed upcoming,
1 awaiting documents, 1 documents in NEEDS_REVIEW, 3 completed, 1 cancelled), 3 open notifications.

## 5. Scripted conversations

The bot is rule-based, so replies are the same every time. Each bot bubble shows which layer answered
(`handled by: button / command / faq / state machine / existing booking`). Buttons and lists are clickable;
you can also type the answers.

### A. New customer: happy-path booking (about 3 minutes)

Persona: **New customer**.

1. The chat opens with the menu (View cars / Check availability / Existing booking / Talk to someone).
2. `View cars` → list of 6 models with Rs per day (Vitz 1,400 · Swift 1,500 · Fit 1,600 · Corolla 2,200 · X-Trail 3,200 · Tucson 3,500).
3. `Toyota Vitz` (or tap it) → asks for the pickup date and time.
4. `tomorrow 10am` → asks when you return. `3 days` (or `5 Nov 10am`) → asks for the pickup location.
5. `airport` → asks for the drop-off. `Grand Baie` → asks for your name.
6. `Aisha Rahman` → summary: 3 days × Rs 1,400 = 4,200 + airport fee 500 = **Rs 4,700**, cash on collection, with Confirm / Change details / Cancel.
7. `Yes` (or tap Confirm) → booking confirmed, private document-upload link, reminder that payment is cash.

Try the safety nets as you go: `9` as a time (it asks morning or evening), `03/04` (asks which date), `last monday` (date has passed),
`back` (previous step), `Change details` → pick **Name**.

Switch to the **dashboard** (or look at the right-hand feed in `/demo`):

- The new booking shows as **PENDING_DOCUMENTS**, with the full transcript on the booking page.
- On the booking page, the amber panel **DEMO: simulate document upload & verification** → click **Simulate VERIFIED**.
  Status becomes CONFIRMED; in `/demo` a "Message from the team" box appears with the confirmation and cash instructions.
- Click **Mark as Paid** → confirm dialog (Rs 4,700 received in cash) → payment shows PAID.

Expect: the price came from the database, the bot never said it was paid or that documents were approved before you clicked.

### B. FAQ and safety (about 2 minutes)

Persona: **New customer** (press Reset first). Answers come from the knowledge base, verbatim.

- `Can I pay by card?` → cash only, in Rs, at pickup. No card, no advance payment.
- `What do I need to rent a car?` → passport/ID, driving permit held 1 year, age 21+.
- `Quels sont vos horaires ?` → the answer in French (the bot switches to French when you write French).
- `I already paid by bank transfer` → the bot does **not** confirm it; it repeats "cash on collection" and the team gets a note.
- `Give me 20% off` → "Sorry, I didn't understand" + menu (nothing is ever granted by chat). A second not-understood message in a row hands the chat to the team.
- Say `human` → "A member of our team will be in touch"; the dashboard shows a NEEDS_HUMAN notification and the conversation switches to HUMAN mode (the bot stops answering). In the dashboard Inbox, **Take over → reply** shows up in `/demo` within a few seconds; **Return to bot** posts a short digest of what the team said.

### C. Existing customer: late return (about 2 minutes)

Persona: **Existing customer** (press Reset first).

1. `my booking` (or tap Existing booking) → status card for Priya's Vitz (return tomorrow 10:00, payment cash, documents verified) with options.
2. `I'm going to return the car 2 hours late` → asks how late; `2 hours` → shows the new return time and "I'll send this to our team. It isn't approved until they confirm."
3. `yes` → "sent to our team … not approved yet".
4. Dashboard Home: a new **CHANGE REQUEST** notification for her booking; approve or decline it there. (`/demo` feed shows it flagged NEW.)

Expect: the booking's return time is unchanged until the owner approves.

## 6. If something goes wrong during the demo

| Symptom                                                | Do this                                                                                                                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Something went wrong" in the chat                     | Check the Vercel function logs; most often the latest migration (`npx supabase db push`) or `DEMO_MODE` is missing.                                                              |
| `/demo` is a 404                                       | `DEMO_MODE=true` is missing in Vercel (add, redeploy).                                                                                                                           |
| Bot says "I didn't understand" to something reasonable | Expected sometimes: add the phrase to the knowledge base (Settings → Knowledge base) or `lib/bot/lexicon.ts`. See Analytics → Top unrecognised phrases.                          |
| Data looks stale or messy                              | `npm run demo:reset`, refresh both windows (about 20 s).                                                                                                                         |
| Dashboard login fails                                  | `npm run demo:user` prints a new password.                                                                                                                                       |
| Test everything end to end                             | `npm run demo:e2e -- https://<your-app>.vercel.app` chats with the bot, checks the database, logs into the dashboard, simulates VERIFIED and Mark as Paid. Takes under a minute. |
| Not sure what's broken                                 | `npm run demo:check -- https://<your-app>.vercel.app`                                                                                                                            |

## 7. What's mocked or skipped

Mocked: document upload and verification (the Simulate buttons), WhatsApp delivery (messages are stored, not sent).
Not in the demo: Meta/WhatsApp, reminders and scheduled messages, real document OCR, staff roles beyond the single OWNER login,
analytics polish, retention jobs. `/demo`'s side feed and chat reset endpoints are public (demo mode only, demo numbers only).
