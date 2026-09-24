# Component 8 — Document verification

**What it is:** Extract fields, check document type and expiry, compare names, and return
VERIFIED or NEEDS_REVIEW — never an automatic rejection. Claude's vision handles OCR and
extraction in one step. The name comparison is deterministic code, not an AI judgement.

**Matching rules:** normalise names (accents, punctuation, case, spaces); surnames must
match exactly; initials may match full given names ("John M Smith" matches "John Michael
Smith"); anything else, low confidence, expiry, wrong type or unreadable goes to review
with reasons.

## Prompt

```text
Read CLAUDE.md. Build document verification in /lib/verification.

1. extractDocument(fileBuffer, mimeType) — send the image (or PDF pages) to the Claude API (claude-sonnet-5) with vision and a strict JSON output schema:
   { detected_type: PASSPORT | DRIVING_PERMIT | OTHER | UNREADABLE, full_name, surname, given_names, date_of_birth (ISO), document_number, expiry_date (ISO), issuing_country, mrz_present (bool), per-field confidence 0–1, readability_notes }.
   Prompt it to transcribe exactly what's printed, return null for anything not clearly legible, and never guess. For passports, parse the MRZ if visible and cross-check it against the printed fields (use a deterministic MRZ parser with check-digit validation in code — don't trust the model for check digits).
2. compareNames(whatsappName, passportName, permitName) — deterministic TypeScript: normalise (strip diacritics, punctuation, case, extra spaces), surname must match exactly, given names match if equal or if one is an initial of the other, allow missing middle names. Return { score, match: MATCH | PARTIAL | MISMATCH, explanation }.
3. runVerification(bookingId) — for both documents: extract, check detected types are correct, check expiry is after the booking's return date, check MRZ validity, compare names. Result is VERIFIED only if every check passes with confidence >= 0.85 (configurable); otherwise NEEDS_REVIEW with a human-readable reasons[] list. Never output REJECTED — only a staff member can reject.
4. Save document_verifications rows, update booking document_status, write booking_events, and on VERIFIED move booking to DOCUMENTS_VERIFIED then CONFIRMED, and send the customer the cash-payment message (Component 9). On NEEDS_REVIEW create a DOC_REVIEW owner notification and tell the customer "We're reviewing your documents and will confirm shortly."
5. Don't send full document images to any logs. Log only IDs and outcomes.
Tests: use synthetic sample documents (generate fake specimen-style images — never real people's documents) plus unit tests for compareNames covering: exact match, middle initial, missing middle name, swapped given-name order, accents (Hélène vs Helene), different surname, transliteration differences (should go to review, not match).
```
