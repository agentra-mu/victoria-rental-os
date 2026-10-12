# n8n demo chatbot

`demo-chatbot.json` is the brain of the web-chat demo: Chat Trigger → app inbound
endpoint → AI Agent (Gemini + 9 HTTP tools) → app outbound endpoint → reply.
All business logic stays in the Next.js app (`/api/demo/*` → `/lib/domain`); n8n only orchestrates.

The older `whatsapp-inbound.json` and `scheduled-notifications.json` (documented in `WHATSAPP_README.md`) are the WhatsApp (Meta)
workflows. They are not used in the demo.

## Files

| File                | What it is                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `demo-chatbot.json` | Importable workflow (generated)                                                                     |
| `system-prompt.md`  | The agent's system prompt, the source of truth. After editing, run `npm run demo:n8n` and re-import |

## Set up

1. **Credentials** (n8n → Credentials → Create). Use these exact names so the imported nodes find them:
   - **`Gemini Demo`**: type _Google Gemini(PaLM) API_. API key from <https://aistudio.google.com/apikey> (free tier).
   - **`Victoria Internal Secret`**: type _Header Auth_. Name: `x-internal-secret`. Value: the
     `INTERNAL_API_SECRET` from `.env.local` / Vercel.
2. **Import**: Workflows → Import from File → `n8n/demo-chatbot.json`.
3. **Set the app URL**: open the **Config** node and set `app_url` to your deployed app, no trailing
   slash (e.g. `https://victoria-rental-os.vercel.app`). This is the only place the URL lives. If you use a
   tunnel and the URL changes, change it here.
4. **Fix credentials**: open each node that shows a red credential warning and pick the credential
   (Gemini chat model; Inbound; Store reply; all 9 tool nodes).
5. **Allowed origin**: in the **Chat Trigger** node → Options → _Allowed Origins (CORS)_, set your app
   origin (e.g. `https://victoria-rental-os.vercel.app`). The generated file uses `*`.
6. **Activate** the workflow (toggle top right). Chat Trigger only has a production URL when active.
7. Copy the Chat Trigger's **Production URL** (looks like `https://<n8n-host>/webhook/<id>/chat`) into
   `NEXT_PUBLIC_N8N_CHAT_URL` in `.env.local` and in Vercel, then redeploy.
8. Run `npm run demo:check`.

## How it works

```
Chat Trigger ─ Config ─ Inbound ─ Skip AI? ─ yes ─ Team reply (HUMAN takeover / duplicate)
 (sessionId,    (app_url,  POST        │
  metadata      number)   /chat/inbound└ no ─ AI Agent ─ Prepare reply ─ Store reply ─ Reply
  .whatsapp_number)                          ├ Gemini chat model (temp 0.2)   POST /chat/outbound
                                             ├ Window memory (15, key = sessionId)
                                             └ 9 HTTP tools → POST /api/demo/tools/<name>
```

- **The customer identity is never model-controlled.** The chat page sends the persona's number as
  chat `metadata`; the **Config** node copies it to `whatsapp_number`; every tool body contains it as a
  fixed expression (`{{ $('Config').first().json.whatsapp_number }}`), and the model only fills the
  other fields. The server resolves the customer from the number and derives the booking itself.
- If the chat is opened without metadata (n8n's hosted chat page), the number defaults to the
  "new customer" persona `+23057000001`.
- Tool failures come back as `{ ok: false, error: { code, message } }` with HTTP 200, so the model
  can explain them. The agent is capped at 8 iterations.
- Gemini free tier has per-minute request limits. One customer turn can use 3-6 model calls, so
  type at a human pace during the demo. If the bot stops answering, wait a minute.

## What to check after import (I could not test against your n8n)

n8n node parameters change between versions and I generated this file without access to your n8n.
These are the places most likely to need a fix. Tell me what breaks and I'll fix the generator
(`scripts/build-n8n-workflow.ts`).

1. **Chat Trigger**: _Make Chat Publicly Available_ on; _Response Mode_ = "When Last Node Finishes";
   Allowed Origins set. If the option names differ in your version, set them in the UI.
2. **Skip AI?** (IF node): the condition should be `{{ $json.data.skipAgent }}` _is true_. The true branch goes to
   **Team reply**, the false branch to **AI Agent**.
3. **AI Agent**: Prompt type "Define below", text `{{ $('Chat Trigger').first().json.chatInput }}`, the long
   system message present, _Max Iterations_ = 8. The agent type must be "Tools Agent". Check that
   the Gemini model, the memory and all 9 tools are attached to it (they show as sub-nodes).
4. **Gemini chat model**: model is `models/gemini-2.5-flash`. If it is not in your dropdown, pick the
   current Flash model. Temperature 0.2. If tool calling is flaky, try the other Flash model before anything else.
5. **Window memory**: Session ID type "Define below", key `{{ $('Chat Trigger').first().json.sessionId }}`,
   context window 15.
6. **Each of the 9 HTTP Request Tool nodes**: method POST, URL `{{ $('Config').first().json.app_url }}/api/demo/tools/<name>`,
   authentication = Header Auth credential, body = JSON, and a _placeholder definition_ for every `{name}` in
   the body. Tool nodes with no model inputs (`get_customer_context`, `get_fleet`, `get_price_quote`,
   `confirm_booking`) have none. If your version names the placeholder section differently, add the placeholders by hand
   (name + description from the generated JSON).
7. **Expressions inside tool bodies**: `"whatsapp_number": "{{ $('Config').first().json.whatsapp_number }}"`. In some
   versions tool nodes cannot reach other nodes with `$('Config')`. Symptom: tool errors with
   `VALIDATION_ERROR ... whatsapp_number`. Fallback: type the number in by hand for a test to confirm the rest works, then tell me.
8. **Inbound / Store reply** HTTP nodes: JSON body expressions as generated; header auth credential selected.

### Quick test without the chat page

```bash
curl -s -X POST "$N8N_CHAT_URL" -H 'content-type: application/json' \
  -d '{"action":"sendMessage","sessionId":"test-1","chatInput":"Hi","metadata":{"whatsapp_number":"+23057000001"}}'
```

Expected: JSON with an `output` text field. Then look in the dashboard (Inbox) for the stored transcript.

## Fallback: n8n's hosted chat page

If the embedded widget misbehaves, open the Chat Trigger's hosted page: `<Production URL>` (same
`.../webhook/<id>/chat`) in a browser. It works without the demo page, but it has no persona picker (it always chats
as the "new customer" persona), and no live feed. Use the dashboard in a second tab.
