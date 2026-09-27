create table conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  mode conversation_mode not null default 'AI',
  taken_over_by uuid references staff_users (id),
  taken_over_at timestamptz,
  last_message_at timestamptz,
  state jsonb not null default '{}'::jsonb
);

comment on table conversations is
  'One conversation thread per customer. state holds the current booking draft / flow step for the agent — treat it as agent working memory, not a source of truth for booking data (bookings is).';
comment on column conversations.mode is
  'While HUMAN, the AI never replies (see CLAUDE.md-adjacent takeover rules in Component 11) — inbound messages are stored but not answered by the agent.';

create index conversations_customer_idx on conversations (customer_id);
create index conversations_mode_idx on conversations (mode);
