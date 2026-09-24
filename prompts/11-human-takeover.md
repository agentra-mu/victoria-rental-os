# Component 11 — Human takeover

**What it is:** The owner can step in at any time. Build 1 has a Take over button on
booking and customer pages plus the HUMAN keyword; Build 2 turns this into a full inbox
(Component 15).

## Prompt

```text
Read CLAUDE.md, /app/api/whatsapp/inbound and /lib/whatsapp/send.ts. Build human takeover for Build 1.

1. On the booking and customer pages, show the conversation transcript (live via Supabase realtime) with a "Take over conversation" button → sets conversation.mode = HUMAN, taken_over_by, taken_over_at. While HUMAN, the inbound endpoint stores messages but the AI never replies.
2. A message box to reply as the business via send.ts; outbound messages stored with sender = owner. If the 24-hour window has closed, show a clear warning and offer to send an approved template instead.
3. "Return to AI" button → mode AI. The next time the customer messages, the agent's context includes a short system note summarising what the owner discussed (generate this summary with Claude from the transcript since takeover).
4. Auto-return safety: if a conversation has been in HUMAN mode with no owner message for a configurable time (default 12h), create a reminder notification — do NOT auto-return to AI.
Tests for mode switching and for the inbound endpoint respecting HUMAN mode.
```
