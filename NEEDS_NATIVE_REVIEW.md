# French strings that need a native-speaker proofread

All French wording was written by an AI assistant and has **not** been reviewed by a native speaker.
Please proofread everything below. English strings are the reference; Kreol Morisien is not supported yet
(the language layer is built so it can be added — see `MIGRATION_NOTES.md`).

Tone to check: polite _vous_ form, WhatsApp-friendly, Mauritian French (not France-specific idioms).

## 1. Customer-facing templates — `lib/bot/templates/fr.ts`

**Every string in the file** is unreviewed. Template keys (each is one message or button set):

- `askChangeDetails`
- `askDropoffLocation`
- `askMeridiem`
- `askName`
- `askPickupDateTime`
- `askPickupLocation`
- `askReturnDateTime`
- `askTime`
- `askWhichDate`
- `awaitingDocuments`
- `backToBooking`
- `carAmbiguous`
- `carList`
- `carNotUnderstood`
- `carSelected`
- `changeConfirm`
- `changeMenu`
- `changeNotUnderstood`
- `changeSent`
- `chooseBooking`
- `confirmed`
- `dateNotUnderstood`
- `datePast`
- `domainError`
- `draftCancelled`
- `faqAnswer`
- `faqInline`
- `faqNoAnswer`
- `faqThanks`
- `genericError`
- `humanAlreadyNotified`
- `humanHandoff`
- `locationAmbiguous`
- `locationNotUnderstood`
- `mediaNotAccepted`
- `menu`
- `nameInvalid`
- `noActiveBooking`
- `noAvailabilityForDates`
- `nothingToCancel`
- `optedIn`
- `optedOut`
- `paymentClaim`
- `returnBeforePickup`
- `statusCard`
- `stuck`
- `summary`
- `unknown`
- `vehicleUnavailable`

Also in the same file:

- Booking status labels (`STATUS`), document status phrases (`DOCS`), payment phrases (`PAYMENT`).
  Payment wording must keep saying cash only and must never say a payment was received unless the
  database says PAID ("enregistré comme payé par notre équipe").
- `frLabel()` translates the price-line labels the booking engine builds in English
  (e.g. "Pickup fee — …" → "Frais de prise en charge — …").
- Button titles (max 20 characters; WhatsApp truncates longer ones): "Voir les voitures", "Disponibilités",
  "Ma réservation", "Parler à quelqu'un", "Menu principal", "Confirmer", "Modifier", "Annuler", "Retour", …

## 2. Keyword lists — `lib/bot/lexicon.ts`

Check the `fr` arrays of: `COMMANDS` (human, menu, cancel, back, change, yes, no, greeting, thanks),
`INTENTS`, `FAQ_INTENTS`, `DATE_WORDS`, `QUESTION_WORDS`, `LANG_WORDS`, `NAME_PREFIXES`,
`NAME_SUFFIX_PATTERNS`, `SAME_LOCATION`. Missing common phrasings are the main cause of "I didn't
understand" — add them there.

## 3. Knowledge-base translations — `supabase/migrations/20261012100000_deterministic_bot.sql` (and `supabase/seed.sql`)

The 15 seeded entries have `question_fr` / `answer_fr` and French trigger keywords. After the migration
runs, the owner edits these in **Dashboard → Settings → Knowledge base** (no deploy needed). Policy
wording (cancellation, late fee, insurance) should be confirmed by the rental company, not just proofread.

## 4. Location aliases

`locations.aliases` seed values (e.g. "aéroport", "grand bay") — owner-editable in
**Dashboard → Settings → Locations**.
