# Component 4 — WhatsApp integration (n8n)

**What it is:** The pipe between WhatsApp and your system via Meta's WhatsApp Business
Cloud API. n8n receives each message, forwards it to one backend endpoint, and sends the
replies back. Keeping agent logic in the backend makes it testable and portable if you
ever drop n8n.

**Setup you do yourself:** Meta Business account, WhatsApp Business app, phone number,
permanent access token, webhook verification, template approval.

Follow-up prompt for direct sends:

## Prompt 1

```text
Read CLAUDE.md. I'm using n8n (self-hosted, recent version) to orchestrate WhatsApp Business Cloud API messages. Generate an importable n8n workflow JSON file at /n8n/whatsapp-inbound.json, plus a README explaining how to import and configure credentials.

Workflow:
1. Webhook node (GET) for Meta verification: return hub.challenge when hub.verify_token matches the env var.
2. Webhook node (POST) receiving WhatsApp messages. Respond 200 immediately, then process.
3. Ignore status updates (delivered/read) — only process entries with messages[].
4. Extract: from (wa_id), message id, timestamp, type (text, interactive button_reply, interactive list_reply, image, document, location), and the text or selected reply id.
5. HTTP Request to POST {APP_URL}/api/whatsapp/inbound with x-internal-secret header and the normalized payload. This endpoint (which I'll build separately) handles dedupe, customer lookup, message storage, takeover check and the AI reply.
6. The endpoint returns { replies: [ { type: "text" | "buttons" | "list", ...payload } ], notifyOwner?: {...} }. Loop over replies and send each via HTTP Request to the WhatsApp Cloud API messages endpoint (graph.facebook.com, /{PHONE_NUMBER_ID}/messages) with the bearer token.
7. If notifyOwner is present, send a WhatsApp message to the owner's number (env var) — and note in the README that this requires the owner to have messaged the business number in the last 24h or an approved template.
8. Error branch: if the app endpoint fails, send the customer a fallback "Sorry, something went wrong — a member of our team will get back to you shortly" and POST an error log to {APP_URL}/api/whatsapp/error.

Use n8n expressions and environment variables for all secrets/URLs — nothing hardcoded. Use current n8n node types (Webhook, HTTP Request, IF, Split Out / Loop Over Items); if you're unsure of a node's exact current parameter schema, say so in the README and describe how to fix it after import rather than guessing silently.

Also build the matching endpoint /app/api/whatsapp/inbound in Next.js:
- Verify x-internal-secret.
- Dedupe on whatsapp_message_id (return empty replies if already seen).
- Find or create the customer by whatsapp_number; find or create their conversation.
- Store the inbound message.
- If conversation.mode = HUMAN: store the message, create/refresh an owner notification, return no replies.
- If the customer typed HUMAN (case-insensitive) or AGENT: set mode HUMAN, set active booking to NEEDS_HUMAN if applicable, notify owner, reply that a team member will be in touch.
- Otherwise call the agent (stub function for now: runAgent(conversationId) returning a placeholder reply) and store outbound messages.
Include tests for dedupe and takeover logic.
```

## Prompt 2

```text
Read CLAUDE.md. Build /lib/whatsapp/send.ts — a server-side function that sends text, reply-button, list and template messages directly to the WhatsApp Cloud API, stores the outbound message in the messages table, and handles errors (including the "outside 24-hour window" error, which should be surfaced clearly so the dashboard can tell the owner a template is needed). The dashboard will call this directly rather than going through n8n. Add a /n8n/README note explaining which sends go via n8n (inbound replies) and which go direct (owner messages, reminders).
```
