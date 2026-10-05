# Launch checklist — Victoria Car Rental pilot

## Meta / WhatsApp

- [ ] Meta Business verification complete
- [ ] WhatsApp Business phone number registered; `WHATSAPP_PHONE_NUMBER_ID` and a **permanent** system-user `WHATSAPP_TOKEN` set (the temporary token expires in 24h)
- [ ] Templates from `docs/whatsapp-templates.md` submitted **and approved**; registered under Settings → templates
- [ ] Webhook verified (`WHATSAPP_VERIFY_TOKEN`) and **webhook signature verification turned on** in the n8n inbound workflow (X-Hub-Signature-256 with the app secret)
- [ ] Owner has messaged the business number within 24h (or a template is set) so owner alerts/digest are delivered

## Environment (Vercel)

- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`)
- [ ] `APP_URL` (public https URL), `INTERNAL_API_SECRET`, `CRON_SECRET` (if Vercel Cron)
- [ ] `OWNER_WHATSAPP_NUMBER`, `ALERT_WEBHOOK_URL` (hook that emails/pings the admin), optional `REVIEW_LINK`
- [ ] `ENABLE_SIMULATOR` is **unset** in production (set to `true` temporarily only for owner testing)
- [ ] Remove the old `DASHBOARD_PASSWORD` / `STAFF_USER_ID` variables if present — no longer used

## Database

- [ ] `supabase login` + `supabase db push` — applies **all** pending migrations, including `20260927130000_owner_notification_type_other.sql` and `20261005100000_full_build.sql`
- [ ] First OWNER created: create the user in Supabase Auth, then `insert into staff_users (id, name, email, role) values ('<auth user id>', 'Owner', '<email>', 'OWNER');`
- [ ] Seed data **replaced** with the real fleet, locations (opening hours, fees, instructions) and knowledge base
- [ ] Vehicle insurance/inspection/service dates entered (assignment is blocked for expired papers)
- [ ] `/api/health` returns 200 in production
- [ ] **Backup/restore tested**: restore a Supabase backup into a scratch project and confirm bookings + documents resolve

## Business rules still to confirm with the rental company (CLAUDE.md open questions)

- [ ] Rental-day rule and grace period (`lib/domain/config.ts`)
- [ ] Late-return fee and minimum rental period (`lib/domain/changeRequests.ts`, `config.ts`)
- [ ] Document retention period and who may view documents (**retention period confirmed**; nothing auto-deletes yet)
- [ ] Location fees and after-hours pickup rules (Settings → Locations)
- [ ] Customer languages (English / French / Kreol)

## People

- [ ] Owner trained on **Mark as Paid** (cash received → confirm dialog → irreversible except by the owner's "Undo")
- [ ] Owner trained on **document review** (View → Approve / Request re-upload / Reject with reason)
- [ ] Staff accounts invited; permissions reviewed (Settings → Staff)
- [ ] Owner knows Take over / Return to AI, and that HUMAN mode silences the bot

## Pre-launch tests

- [ ] `npm test`, `npm run lint`, `npm run typecheck`, `npm run format:check`
- [ ] `npm run evals` against the real Claude API reviewed
- [ ] `npm run e2e` against a staging database
- [ ] Owner has run a full booking through `/dev/simulator`
- [ ] Real-phone test: booking, HEIC passport photo upload, approve, mark paid

## Known pilot limitations

- Document verification is a stub: uploads always land in NEEDS_REVIEW for a human (never auto-verified or auto-rejected).
- The upload-page rate limiter is per server instance (needs a shared store for multi-instance hardening).
- Dashboard pages refresh by polling (6–15s), not Supabase Realtime.
- Vehicle auto-assignment (`lib/domain/assignVehicle.ts`) is available to the engine but the agent still books a specific car; reassignment from the booking page/calendar is the owner's tool.
