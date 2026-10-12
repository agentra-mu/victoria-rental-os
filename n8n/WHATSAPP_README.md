# n8n — WhatsApp integration

n8n is thin orchestration only (CLAUDE.md): it receives WhatsApp webhooks, calls one backend
endpoint, and relays the backend's reply back to WhatsApp. All the actual logic — dedupe,
customer lookup, takeover detection, the AI agent — lives in the Next.js app
(`/app/api/whatsapp/inbound`, `/lib/whatsapp/*`), so it's unit-tested and portable if you ever
drop n8n.

## Which sends go through n8n vs. direct

- **n8n (`whatsapp-inbound.json`)**: every reply to an inbound customer message, plus the
  "notify owner" ping that rides along with a takeover. This is the high-volume, low-latency
  path — n8n just relays what the backend already built.
- **Direct (`/lib/whatsapp/send.ts`)**: anything the _dashboard_ or a backend job triggers on
  its own — an owner sending a message from the dashboard, automated reminders (Component 17),
  etc. These don't originate from a webhook, so there's no n8n workflow to route them through;
  they call the WhatsApp Cloud API directly and store the outbound message themselves.

## Importing the workflow

1. n8n → **Workflows → Import from File** → select `n8n/whatsapp-inbound.json`.
2. Set these environment variables in n8n (**Settings → Environment Variables**, or your
   n8n host's env config — do **not** hardcode them in the workflow):
   - `APP_URL` — your deployed Next.js app's base URL (e.g. `https://your-app.vercel.app`), no
     trailing slash.
   - `INTERNAL_API_SECRET` — same value as `INTERNAL_API_SECRET` in the app's `.env.local`.
   - `WHATSAPP_VERIFY_TOKEN` — same value as the app's `.env.local`; also what you'll enter in
     Meta's webhook verification dialog.
   - `WHATSAPP_TOKEN` — the WhatsApp Business Cloud API permanent access token.
   - `WHATSAPP_PHONE_NUMBER_ID` — your WhatsApp Business phone number ID.
   - `OWNER_WHATSAPP_NUMBER` — E.164, no `+` needed here (the workflow doesn't strip one; see
     below) — the owner's WhatsApp number for takeover notifications.
3. Activate the workflow. Both the GET (verification) and POST (message delivery) triggers
   register on the same path — see "Two webhook nodes, one path" below — so n8n gives you a
   single public webhook URL, e.g. `https://your-n8n-host/webhook/whatsapp-inbound`.
4. In Meta's App Dashboard → WhatsApp → Configuration, set that URL as the webhook callback URL,
   enter your `WHATSAPP_VERIFY_TOKEN` as the verify token, and subscribe to the `messages` field.

## How the workflow is structured

- **Webhook - Verify (GET)** → **Verify Token Matches** → **Respond Challenge** (200, body is
  `hub.challenge`) or **Respond Forbidden** (403). This is Meta's one-time webhook verification
  handshake.
- **Webhook - Inbound (POST)** → **Respond 200 Immediately** (empty 200 response, so Meta's
  retry logic doesn't kick in) → **Has Messages** (an IF node that drops `statuses`-only
  payloads — delivered/read receipts — so we don't process those).
- **Normalize Inbound Message** (a Code node) extracts `from`, `messageId`, `timestamp`, `type`,
  and `text`/`replyId` from whichever shape Meta sent (plain text, button reply, list reply,
  image, document, location; anything else falls back to a `text` message tagged
  `[unsupported message type: …]` rather than erroring the workflow).
- **Call Backend** POSTs the normalized payload to `{{$env.APP_URL}}/api/whatsapp/inbound` with
  `x-internal-secret`. On success, its output feeds two parallel branches:
  - **Split Replies** → **Reply Type** (a Switch on `reply.type`) → **Send Text Reply** or
    **Send Interactive Reply** — one Graph API call per reply the backend returned.
  - **Has Owner Notification** → **Notify Owner**, if the backend's response included a
    `notifyOwner` object (this happens once, when a customer asks for a human — see the 24h
    window note below).
  - On failure (`onError: continueErrorOutput`), the **error output** fires
    **Send Fallback To Customer** (a plain "something went wrong" text) and **Log Error**
    (POSTs to `/api/whatsapp/error`) in parallel.

Every `to` field the workflow sends uses `from` exactly as Meta gave it (digits only, no `+`) —
that's already the format the Graph API's `to` field wants, so no normalization is needed on
the outbound side.

## The 24-hour customer service window

WhatsApp only allows free-form messages (including interactive lists/buttons) within 24 hours
of the customer's last message. **Notify Owner** is a plain text send, so if the owner hasn't
messaged the business number in the last 24h, that call will fail with Meta's error code
`131047`. This workflow doesn't currently branch on that failure for the owner-notify send —
if you hit it in practice, either have the owner message the number once to open a fresh
24h window, or replace **Notify Owner**'s body with an approved template message (see
`sendTemplateMessage` in `/lib/whatsapp/send.ts` for the direct-send equivalent, which surfaces
this same error as `WhatsAppSendError` with `code: "OUTSIDE_24H_WINDOW"`).

## Two webhook nodes, one path

Rather than configuring one Webhook node to accept both GET and POST (whose exact parameter
for "multiple HTTP methods" varies across n8n versions — see below), this workflow uses two
separate Webhook nodes on the same `path` value (`whatsapp-inbound`), one restricted to GET and
one to POST. n8n routes by (path, method), so both still resolve to the same public URL. If
your n8n version's UI instead exposes a single Webhook node with a method-selector that accepts
multiple values, you can consolidate these into one node and route on `$json.query["hub.mode"]`
(present only on GET) — but the two-node version above should just work without that.

## Things to verify after import (node-schema version drift)

I generated this workflow's JSON without access to your n8n instance, so I can't confirm the
exact current parameter shape for every node type against your installed version. Everything
above reflects the intended _logic_, which doesn't change; the following are the specific spots
most likely to need a small click-through fix after import, in decreasing order of how likely
they are to actually be wrong:

1. **IF / Switch node condition schema** (`Verify Token Matches`, `Has Messages`,
   `Has Owner Notification`, `Reply Type`). I used the v2 "filter" condition shape
   (`conditions.conditions[].{leftValue, rightValue, operator: {type, operation}}`). If n8n
   shows these nodes with broken/unrecognized conditions on open, delete the condition and
   re-enter it directly in the UI — the _values_ to compare (shown in each node's description
   above) are what matter, not the JSON encoding.
2. **HTTP Request body parameter name** (`Call Backend` and every `Send *` node). I used
   `specifyBody: "json"` + `jsonBody: "=...")`. Some versions call this field differently. If a
   node shows an empty/invalid body on open, switch "Body Content Type" to JSON and paste in the
   expression from `jsonBody` above.
3. **`onError: "continueErrorOutput"`** on `Call Backend`. This is what gives the node two
   outputs (success / error) for the fallback-and-log branch. If your version doesn't show a
   second output automatically, open the node's "Settings" tab and look for "On Error" →
   "Continue (using error output)", or the equivalent toggle.
4. **Split Out node name/type** (`Split Replies`). Some n8n versions ship this as part of an
   "Item Lists" node instead of a standalone "Split Out" node. If the import shows this node as
   unrecognized, replace it with whichever of your version's nodes splits an array field
   (`data.replies`) into one item per array element — everything downstream expects one reply
   object per item.
5. **Respond to Webhook mid-workflow.** The design relies on `Respond 200 Immediately` sending
   the HTTP response right away while the workflow keeps running afterward (steps 5 onward).
   This is standard `responseMode: "responseNode"` behavior, but if you find Meta's webhook
   retrying (suggesting the response isn't actually going out before processing finishes), check
   this node's execution timing first.

None of these affect the actual business logic (all of that is backend-side and unit-tested) —
worst case, a node needs its condition or body re-entered by hand in the n8n editor, using the
plain-English description above as the source of truth.

## Scheduled notifications (choose ONE scheduler)

`/api/cron/notifications` sends reminders, nudges, thank-yous, the 07:30 owner digest,
fleet-document alerts, change-request expiry and the human-mode reminder.

- **(a) Vercel Cron** — `vercel.json` already calls it every 15 minutes. Set `CRON_SECRET`
  in Vercel (Vercel sends it as a Bearer token). Note: Hobby plans only allow daily crons;
  15-minute schedules need Pro.
- **(b) n8n** — import `n8n/scheduled-notifications.json` (Schedule Trigger → HTTP POST with
  `x-internal-secret`). If you use this, remove `vercel.json` so it doesn't run twice
  (it's safe anyway: every send is recorded in `scheduled_messages`, so nothing is sent twice).
