create sequence vehicle_code_seq start 1;

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_code text not null unique
    default ('CAR-' || lpad(nextval('vehicle_code_seq')::text, 3, '0')),
  make text not null,
  model text not null,
  category_id uuid not null references vehicle_categories (id),
  registration text not null unique,
  transmission text,
  seats integer,
  daily_price_rs integer not null check (daily_price_rs >= 0),
  home_location_id uuid references locations (id),
  status vehicle_status not null default 'ACTIVE',
  photo_url text,
  created_at timestamptz not null default now()
);

comment on table vehicles is
  'Physical vehicle records — Build 1 assigns one directly on the booking; Component 13 adds strategy-based assignment.';
comment on column vehicles.daily_price_rs is
  'Price in Mauritian Rupees. Prices come only from here — never invented by the AI (see CLAUDE.md).';

create index vehicles_category_idx on vehicles (category_id);
create index vehicles_status_idx on vehicles (status);
