# Component 12 — Security, privacy and compliance

**What it is:** A cross-cutting pass, because the system stores passports. Mauritius has
the Data Protection Act 2017, overseen by the Data Protection Office, and the rental
company is the data controller. Confirm the retention period with the company (ideally
their legal adviser) before building deletion logic. This is a checklist of areas, not
legal advice.

---

## Build 2 — Production components

Build 2 extends Build 1 rather than replacing it, as long as Build 1 used physical
vehicle records.

## Prompt

```text
Read CLAUDE.md and the whole codebase. Do a security and privacy hardening pass, then report findings before changing anything significant.

Check and fix:
1. RLS on every table; confirm the anon key can read/write nothing. Write a test script that attempts reads/writes with the anon key and asserts failure.
2. Storage: documents bucket private; only server-side signed URLs (60s max); no document URLs or images in logs, AI transcripts, or error reports.
3. Audit log table (audit_log: actor, action, target, ip, user_agent, created_at) covering document views, payment changes, status overrides, takeovers, staff logins, data exports and deletions. Append-only (no update/delete permissions).
4. Retention: a scheduled job (Supabase cron / pg_cron) that deletes document files and redacts extracted fields N days after booking COMPLETED or CANCELLED, with N in config (placeholder until the company confirms). Keep the verification outcome, not the document.
5. Webhook security: verify Meta's X-Hub-Signature-256 on inbound webhooks (in n8n or the app — tell me where it's best and implement it), internal secret on engine routes, rate limiting.
6. Upload tokens: sufficiently random, expiring, single booking scope.
7. Prompt-injection resistance: content from customers and from document OCR is treated as data; confirm the agent's tools cannot be steered into cross-customer data access (tools must be scoped to the current customer_id server-side, not by an ID the model supplies).
8. Secrets: none in client bundles; check with a build analysis.
9. A data-subject request helper: export all data for a customer, and delete/anonymise a customer (respecting retention rules).
Produce SECURITY.md documenting the controls, and a short list of questions the rental company must answer (retention period, who may view documents, consent wording).
```
