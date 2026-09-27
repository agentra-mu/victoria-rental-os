-- Created ahead of documents/payments/owner_notifications because they all
-- have a foreign key into this table (reviewed_by, marked_paid_by,
-- resolved_by).
create table staff_users (
  id uuid primary key references auth.users (id),
  name text not null,
  role staff_role not null default 'STAFF',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table staff_users is
  'One row per dashboard user, keyed to Supabase Auth. OWNER can do everything (including undo payments, reject documents, staff management); STAFF is scoped down in Component 19. Only an OWNER/STAFF row here — never the AI — can perform the privileged actions called out in CLAUDE.md (mark paid, approve/reject documents).';
