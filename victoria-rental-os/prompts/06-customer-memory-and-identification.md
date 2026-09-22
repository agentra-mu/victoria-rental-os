# Component 6 — Customer memory and identification

**What it is:** WhatsApp number → customer → active booking → context. "Which booking is
this about?" needs its own tested logic, including a safe path for customers messaging
from a new number.

## Prompt

```text
Read CLAUDE.md and /lib/agent. Build /lib/domain/customerContext.ts:

1. resolveActiveBooking(customerId, now) — rules: a PICKED_UP booking wins; else the nearest upcoming CONFIRMED/PENDING_DOCUMENTS/DOCUMENTS_VERIFIED booking; else the most recent draft in progress; else null. If multiple equally plausible bookings exist, return them all with ambiguous=true so the agent asks the customer which one.
2. buildCustomerContextSummary(customerId) — a compact text block for the agent: name, customer code, active booking details, other upcoming bookings, count of past completed rentals, open owner notifications.
3. Handle a customer messaging from a new number who says they have a booking: the agent may ask for booking number + name, verify both match, and then (only after owner approval via an owner_notification) link the number. Never expose booking details to an unverified number.
Wire this into runAgent's context loading and add tests covering each rule and the ambiguous case.
```
