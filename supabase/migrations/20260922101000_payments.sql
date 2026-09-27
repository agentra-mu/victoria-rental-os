create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id),
  amount_rs integer not null check (amount_rs >= 0),
  method payment_method not null default 'CASH',
  marked_paid_by uuid not null references staff_users (id),
  marked_paid_at timestamptz not null default now()
);

comment on table payments is
  'A payments row can only be created with an authenticated staff_users id (marked_paid_by is NOT NULL, FK-enforced) — there is no code path that lets the AI or an n8n-callable endpoint insert one. See bookings_require_payment_row_for_paid below for the matching guard on bookings.payment_status.';

create index payments_booking_idx on payments (booking_id);

-- Database-level enforcement of "the AI must never mark a payment as PAID"
-- (CLAUDE.md): bookings.payment_status can only transition to PAID inside
-- the same transaction as (or after) a payments row for this booking with a
-- non-null marked_paid_by already exists. This doesn't replace the
-- application-level markAsPaid() function (Component 9) — it's the safety
-- net for the case where something bypasses it.
create or replace function require_payment_row_for_paid()
returns trigger
language plpgsql
as $$
declare
  v_becoming_paid boolean;
begin
  if tg_op = 'INSERT' then
    v_becoming_paid := (new.payment_status = 'PAID');
  else
    v_becoming_paid := (new.payment_status = 'PAID' and old.payment_status is distinct from 'PAID');
  end if;

  if v_becoming_paid and not exists (
    select 1 from payments
    where booking_id = new.id
      and marked_paid_by is not null
  ) then
    raise exception
      'PAYMENT_NOT_AUTHORIZED: bookings.payment_status cannot become PAID without a payments row with marked_paid_by (booking %)',
      new.id
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Covers both paths: an UPDATE that flips payment_status to PAID, and a
-- (should-never-happen-but-don't-trust-it) direct INSERT that tries to
-- create a booking already marked PAID.
create trigger bookings_require_payment_row_for_paid
  before insert or update of payment_status on bookings
  for each row execute function require_payment_row_for_paid();
