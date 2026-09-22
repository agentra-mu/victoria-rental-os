# Component 16 — Delays, pickup changes and extensions

**What it is:** Structured requests. The AI records the request, checks what it can
(availability, price), quotes it, and sends it to the owner. The booking changes only
after owner approval.

## Prompt

```text
Read CLAUDE.md, the agent and the booking engine. Build the change-request workflow.

1. booking_change_requests table: booking_id, type (RETURN_DELAY, PICKUP_TIME_CHANGE, RETURN_TIME_CHANGE, EXTENSION, LOCATION_CHANGE, CANCELLATION), requested_values jsonb, current_values jsonb, quoted_additional_rs, availability_ok, status (PENDING, APPROVED, DECLINED, EXPIRED), decided_by, decided_at, customer_notified_at.
2. Agent tool request_booking_change(type, details): for EXTENSION and time changes, the engine checks whether the same physical vehicle is free for the new window (and if not, whether another vehicle of the same model could be swapped in — flag that for the owner), and calculates the additional amount with calculatePrice. The agent tells the customer the quote and that it has been sent to the team for approval — never that it is approved.
3. Late-return rule from config (e.g. grace period, then hourly or daily late fee) applied in the quote for RETURN_DELAY.
4. Dashboard: request cards in notifications and the inbox with current vs requested values, price difference, conflicts, and Approve / Decline / Contact customer buttons. Approve applies the change through the engine (re-validating availability at that moment), updates the total, writes booking_events, and messages the customer. Decline asks for an optional reason and messages the customer.
5. Requests auto-expire if the requested time has passed without a decision; notify the owner.
Evals: add scripted conversations for each type to the agent eval harness, and unit tests for approval race conditions (another booking taking the slot before approval).
```
