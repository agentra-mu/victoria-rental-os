-- Full-text search for the knowledge base retrieval endpoint (Component 3).
-- topic/question are weighted higher than answer text so a query matching
-- the FAQ's own wording ranks above one that only happens to share words
-- with a long answer.
alter table knowledge_base
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(topic, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(question, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(answer, '')), 'B')
  ) stored;

create index knowledge_base_search_idx on knowledge_base using gin (search_vector);

comment on column knowledge_base.search_vector is
  'Generated tsvector for full-text search — see /app/api/engine/knowledge (Component 3).';
