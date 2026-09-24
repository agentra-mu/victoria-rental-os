# Component 9 — Cash payment and customer messages

**What it is:** Cash only. After verification the customer is told the total and to bring
cash. Payment stays UNPAID until the owner clicks Mark as Paid — the AI can never change
it.

## Prompt

```text
Read CLAUDE.md. Build payment handling and transactional customer messages.

1. /lib/domain/payments.ts — markAsPaid(bookingId, staffUserId, amountRs) creates a payments row and sets payment_status PAID in one transaction; requires an authenticated staff user; writes booking_events with actor owner. Also undoMarkAsPaid for mistakes, OWNER role only, with a required reason.
2. Make sure no agent tool and no n8n-callable endpoint can change payment_status. Add a test that asserts this by scanning the agent tool list and the /api/engine routes.
3. /lib/notifications/customerMessages.ts — templated messages (config-driven company name) for: booking summary, upload link, documents verified + cash payment instructions ("Your rental total is Rs X. Payment is made by cash when collecting your vehicle. If you have any difficulty paying by cash, reply HUMAN"), documents under review, booking cancelled. Send via /lib/whatsapp/send.ts.
4. If a customer says they can't pay cash, the agent escalates with type CASH_ISSUE (verify this is covered in the agent's tools and evals).
```
