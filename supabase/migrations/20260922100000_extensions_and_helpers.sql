-- Extensions and shared helper functions used by later migrations.

-- gen_random_uuid() for primary keys.
create extension if not exists pgcrypto;

-- Gives gist indexes equality support for scalar types (uuid, int4, ...) so
-- we can build the exclusion constraint that prevents double-booking a
-- vehicle (see 20260922100600_bookings.sql).
create extension if not exists btree_gist;

-- Generic "bump updated_at on any change" trigger, reused by every table
-- below that has an updated_at column.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'Row-level BEFORE UPDATE trigger: sets updated_at = now() on every update.';
