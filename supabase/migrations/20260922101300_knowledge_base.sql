create table knowledge_base (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  question text not null,
  answer text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table knowledge_base is
  'Content the AI answers FAQs from — the owner edits this without touching code. Full-text search (tsvector/GIN) is added in Component 3 alongside the retrieval endpoint; this migration only holds the columns.';

create index knowledge_base_active_idx on knowledge_base (active) where active;

create trigger knowledge_base_set_updated_at
  before update on knowledge_base
  for each row execute function set_updated_at();
