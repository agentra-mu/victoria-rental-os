# Component 17 — Automated reminders and owner digest

**What it is:** Scheduled messages before pickup, on pickup day, before return and after
return, plus a daily owner summary. These must use WhatsApp template messages.

## Prompt

```text
Read CLAUDE.md and /lib/whatsapp/send.ts. Build automated notifications.

1. /lib/notifications/schedule.ts — computes which messages are due now: pickup reminder (day before, 18:00 Mauritius time), pickup-day message (2h before pickup, with location instructions), return reminder (morning of return day), thank-you after RETURNED/COMPLETED (with optional review link from config), documents-still-missing nudge (24h after PENDING_DOCUMENTS; second nudge at 48h; then notify owner). Owner daily digest at 07:30: today's pickups/returns grouped by location, unpaid confirmed bookings, open requests, documents needing review.
2. scheduled_messages table to record every send (booking_id, kind, sent_at, whatsapp_message_id, status) so nothing is sent twice.
3. Route /api/cron/notifications (protected by secret) that sends everything due. Use approved template names from a config table (template_name, language, parameter mapping) — list the templates I need to submit to Meta, with suggested wording and parameters, in /docs/whatsapp-templates.md.
4. Provide both scheduling options: (a) Vercel Cron config calling the route every 15 minutes, and (b) an importable n8n workflow /n8n/scheduled-notifications.json with a Schedule Trigger calling the same route. I'll choose one.
5. Customers can reply STOP to reminders; record opt-out and respect it for non-essential messages.
```
