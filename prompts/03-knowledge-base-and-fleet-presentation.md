# Component 3 — Knowledge base and fleet presentation

**What it is:** The content the bot answers from — company info, policies, FAQs, fleet
list. The AI retrieves it rather than inventing answers, and the owner edits it without
touching code.

## Prompt

```text
Read CLAUDE.md. Build knowledge base and fleet retrieval for the chatbot.

1. /app/api/engine/knowledge — GET with ?q= returns the most relevant active knowledge_base entries. For the trial, use Postgres full-text search (add a tsvector column + GIN index via migration). Return at most 5 entries.
2. /app/api/engine/knowledge/all — returns all active entries compactly (the whole KB is small enough to put in the AI's context for the trial; I want both options).
3. /app/api/engine/fleet — returns the fleet grouped by model with category, daily price, transmission, seats, photo_url, and (if dates are provided) availability count.
4. /lib/whatsapp/format.ts — helper functions that format fleet lists, booking summaries and prices as WhatsApp-friendly text (WhatsApp *bold*, line breaks, emoji used sparingly, prices as "Rs 7,500"). Also a helper that builds WhatsApp interactive list message payloads (max 10 rows, row title max 24 chars) and reply-button payloads (max 3 buttons, title max 20 chars), truncating safely.
Include tests for the formatters.
```
