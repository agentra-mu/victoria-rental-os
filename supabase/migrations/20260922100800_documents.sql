create table documents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id),
  customer_id uuid not null references customers (id),
  doc_type doc_type not null,
  storage_path text not null,
  mime_type text not null,
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table documents is
  'Metadata only. Files live in a PRIVATE Supabase Storage bucket (see Component 7) at documents/{booking_id}/{doc_type}-{uuid}.{ext} — storage_path stores that path, not a public URL. Read only via short-lived signed URLs, with every access audit logged (see CLAUDE.md).';

create index documents_booking_idx on documents (booking_id);
create index documents_customer_idx on documents (customer_id);
