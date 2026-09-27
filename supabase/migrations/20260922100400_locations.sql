create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_pickup boolean not null default true,
  is_dropoff boolean not null default true,
  opening_hours jsonb,
  instructions text,
  google_maps_url text,
  extra_fee_rs integer not null default 0,
  active boolean not null default true
);

comment on table locations is
  'Pickup/drop-off points. opening_hours shape and after-hours fee rules are extended in Component 14; Component 1 just holds the columns.';
comment on column locations.extra_fee_rs is 'Flat fee in Mauritian Rupees for using this location, if any.';

create index locations_active_idx on locations (active) where active;
