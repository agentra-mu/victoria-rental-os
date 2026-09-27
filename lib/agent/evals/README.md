# Agent evals

15 scripted conversations that exercise the real Claude API against an
in-memory fleet/booking DB (the same `createFakeDb`/`createFakeMessagingDb`
fakes the unit tests use — see `/lib/agent/testing/fixtures.ts`), asserting
on which tools got called and on key phrases in the final reply.

## Why these aren't part of `npm test`

- They call the real Anthropic API (`ANTHROPIC_API_KEY`), so they cost money
  and depend on network access.
- Model output isn't fully deterministic, so assertions are necessarily
  looser (regex/keyword checks, tool-call names) than the exact-value
  assertions in the unit tests — that's expected for an eval suite, not a
  correctness bug.
- They're slower (each scenario is several real round trips, some with a
  multi-step tool loop).

`vitest.config.mts` only picks up `**/*.test.ts`, so these `*.eval.ts` files
are invisible to `npm test`/CI by construction. They also skip themselves
(`describe.skipIf`) if `ANTHROPIC_API_KEY` isn't set, so `npm run evals`
fails loud-but-harmless rather than silently passing zero tests.

## Running

```sh
ANTHROPIC_API_KEY=sk-ant-... npm run evals
```

Optionally set `ANTHROPIC_MODEL` to point at a specific model/version.

## Why an in-memory DB instead of the hosted dev Supabase project

Every scenario creates bookings and mutates conversation state; running that
repeatedly against the shared hosted dev project (see the project's
`hosted-supabase-for-dev` memory) would pollute the same fixtures the manual
Component 1-4 verification relies on. The in-memory fake is the existing
"seeded test DB" pattern already used by every other test in this repo
(`FakeDbSeed`) — it's what "seeded test DB" means here, not a live Postgres
instance.

## What each scenario checks

See `scenarios.eval.ts` — the 15 cases cover: a full happy-path booking,
unavailable dates, invalid (past) dates, the credit-card FAQ (must say cash
only), a customer claiming they already paid (must not confirm payment), a
late-return message, a pickup-time change, an extension request, an explicit
request for a human, a French-language booking, a Kreol Morisien booking, a
prompt-injection attempt, a request for a car category outside the fleet, a
document-upload-link re-send, and an accident report.

## If a scenario is flaky

Loosen the assertion before concluding the agent is broken — these test
_behavior_, not exact wording. A tool-call assertion (e.g. "did
`escalate_to_human` get called") is more reliable than a text regex; prefer
adding/checking those over tightening wording matches.
