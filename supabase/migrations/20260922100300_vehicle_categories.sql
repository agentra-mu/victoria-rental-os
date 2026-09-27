create table vehicle_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);

comment on table vehicle_categories is 'Economy, Sedan, SUV, ... — used for fleet grouping and browsing.';
