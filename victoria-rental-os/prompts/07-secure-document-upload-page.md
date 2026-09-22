# Component 7 — Secure document upload page

**What it is:** After confirming, the customer gets a link like
`yourdomain.com/documents/{token}` to upload passport and driving permit. Mobile-first,
and it exposes nothing beyond that booking's basics.

## Prompt

```text
Read CLAUDE.md. Build the document upload flow.

1. Page /app/documents/[token]/page.tsx — mobile-first, no login. Validates the upload_token (exists, not expired, booking in PENDING_DOCUMENTS or document_status NEEDS_REVIEW with a re-upload request). Shows only: company name, booking number, car model, dates, and first name. Invalid/expired token → friendly message to request a new link on WhatsApp.
2. Two upload slots: Passport, Driving Permit. Accept JPEG/PNG/HEIC/PDF, max 10MB each, camera capture on mobile. Client-side preview; convert HEIC to JPEG server-side.
3. Upload goes to a Next.js route handler (not directly from browser to Supabase) that re-validates the token, checks real file type via magic bytes, strips EXIF metadata from images, and stores to a PRIVATE Supabase Storage bucket at documents/{booking_id}/{doc_type}-{uuid}.{ext}. Insert documents rows; set document_status PENDING.
4. Rate-limit the endpoints per token and per IP.
5. When both documents are uploaded, trigger verification (call /lib/verification/run — stub for now) and show "Thanks — we're checking your documents. We'll message you on WhatsApp."
6. Storage bucket policy: no public access at all; only the service role can read/write. Write the storage policy SQL as a migration.
Accessibility, clear error states, and a short privacy note explaining why documents are collected and how long they're kept (placeholder text I'll finalise with the company).
```
