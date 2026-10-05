-- Private Supabase Storage bucket for identity documents (CLAUDE.md:
-- "private storage, signed short-lived URLs, audit logging on every
-- access"). See prompts/07-secure-document-upload-page.md and the
-- documents table comment in 20260922100800_documents.sql — files live at
-- documents/{booking_id}/{doc_type}-{uuid}.{ext}, and `documents.storage_path`
-- stores that path, never a public URL.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by default on every Supabase
-- project. Deliberately no row policy is added here for the `documents`
-- bucket — same "absence of a policy is a deny" rule used for every table
-- in 20260922101500_rls_and_grants.sql: with RLS on and no permissive
-- policy, anon and authenticated get zero access to any object in this
-- bucket, from either the client libraries or the Storage REST/API routes.
--
-- Only the service-role Supabase client (lib/supabase/server.ts) can read or
-- write — it bypasses RLS entirely (BYPASSRLS) — and the app only ever
-- reads a document back through a short-lived signed URL it generates
-- server-side (never a public or authenticated-session URL), with every
-- access audit logged in application code (Component 8+).
