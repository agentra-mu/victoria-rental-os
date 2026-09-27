create table document_verifications (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id),
  extracted_name text,
  extracted_dob date,
  document_number text,
  expiry_date date,
  detected_doc_type doc_type,
  name_match_score numeric(4, 3),
  confidence numeric(4, 3),
  result verification_result not null,
  reasons text[] not null default '{}',
  reviewed_by uuid references staff_users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table document_verifications is
  'One row per extraction/verification attempt. result is VERIFIED or NEEDS_REVIEW only — the system never writes REJECTED here (see CLAUDE.md); rejection is a separate, authenticated staff action recorded via reviewed_by/reviewed_at plus a bookings.document_status update in application code.';
comment on column document_verifications.reasons is
  'Human-readable reasons for NEEDS_REVIEW (e.g. name mismatch, low confidence, expiry before return date).';

create index document_verifications_document_idx on document_verifications (document_id);
