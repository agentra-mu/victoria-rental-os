# Component 20 — Testing and launch readiness

### Order to run the prompts

| Phase | Components | Result |
| --- | --- | --- |
| Foundation | 0 → 1 → 2 → 3 | Project, database, booking engine, knowledge base |
| See the data | 10 | Basic dashboard to inspect what the bot creates |
| WhatsApp + AI | 4 → 5 → 6 | Messages flow; the agent books and remembers customers |
| Documents + payment | 7 → 8 → 9 | Upload, verification, cash instructions |
| Control + safety | 11 → 12 → 20 | Takeover, hardening, launch — Build 1 complete |
| Build 2 | 13 → 14 → 16 → 15 → 17 → 18 → 19 | Fleet, calendar, requests, inbox, reminders, analytics, roles |

### Open questions for the rental company

- [ ] Rental-day rule: how are days counted, and is there a grace period?
- [ ] Late-return fee and minimum rental period
- [ ] Document retention period and who may view documents
- [ ] Location fees and after-hours pickup rules
- [ ] Which languages customers use most (English, French, Kreol)

## Prompt

```text
Read CLAUDE.md and the full codebase. Prepare for a pilot launch with the rental company.
1. Run all unit tests and agent evals; fix failures and report anything you changed in behaviour.
2. Write an end-to-end test (Playwright) for: owner login, viewing a booking created via a simulated WhatsApp conversation, uploading documents via the upload page, verification landing in NEEDS_REVIEW, owner approving, marking paid.
3. A WhatsApp simulator page (/dev/simulator, disabled in production) that lets me chat with the agent as a fake phone number without Meta, calling /api/whatsapp/inbound directly — so the rental owner can test before WhatsApp is approved.
4. Monitoring: structured logging, error alerting (to the owner/admin email), and a /api/health endpoint that checks DB, WhatsApp token validity and Anthropic API reachability.
5. A LAUNCH_CHECKLIST.md: Meta business verification, phone number, templates approved, webhook signature verification on, env vars set in Vercel, seed data replaced with real fleet/locations/knowledge base, retention period confirmed, owner trained on Mark as Paid and document review, backup/restore tested.
```
