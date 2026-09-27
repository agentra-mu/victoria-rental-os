create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id),
  direction message_direction not null,
  sender message_sender not null,
  body text not null,
  whatsapp_message_id text unique,
  created_at timestamptz not null default now()
);

comment on table messages is
  'Every inbound/outbound WhatsApp message. whatsapp_message_id is unique and nullable — inbound messages always have one (used to dedupe retried webhook deliveries); outbound messages sent before a WhatsApp message id is known may be null momentarily.';

create index messages_conversation_idx on messages (conversation_id, created_at);
