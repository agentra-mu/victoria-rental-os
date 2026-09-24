# Component 15 — Conversation inbox

**What it is:** A WhatsApp-style inbox where the owner sees every conversation by
priority, takes over, replies, and hands back to the AI.

## Prompt

```text
Read CLAUDE.md and the existing takeover code. Build /dashboard/inbox — a WhatsApp-style inbox.

- Left pane: conversations sorted by last message, each showing customer name, linked active booking, last message preview, and a priority indicator: red = NEEDS_HUMAN / document review failed / complaint, amber = open request (delay, pickup change, extension, cash issue), green = AI handling normally. Filters: needs attention, human mode, all.
- Right pane: full thread (customer, AI and owner messages visually distinct), booking context sidebar (booking summary, quick actions: Mark paid, Approve request, Open booking).
- Take over / Return to AI toggle; composer with quick-reply snippets the owner can manage; template picker when outside the 24h window.
- AI-suggested reply: button that drafts a reply with Claude from the context for the owner to edit and send — never sent automatically while in HUMAN mode.
- Realtime updates and a browser notification/sound for new red items.
- Staff assignment: assign a conversation to a staff member.
```
