create sequence customer_code_seq start 1;

create table customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null unique
    default ('CUST-' || lpad(nextval('customer_code_seq')::text, 6, '0')),
  whatsapp_number text not null unique,
  full_name text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table customers is
  'One row per WhatsApp number. whatsapp_number is E.164 (e.g. +230XXXXXXXX).';
comment on column customers.customer_code is 'Readable ID, e.g. CUST-000183.';

-- No separate index on whatsapp_number: the UNIQUE constraint above already
-- creates one.

create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();
