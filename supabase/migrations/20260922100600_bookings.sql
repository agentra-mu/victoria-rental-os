create sequence booking_number_seq start 1000;

create table bookings (
  id uuid primary key default gen_random_uuid(),
  booking_number integer not null unique default nextval('booking_number_seq'),
  customer_id uuid not null references customers (id),
  vehicle_id uuid references vehicles (id),
  pickup_location_id uuid references locations (id),
  dropoff_location_id uuid references locations (id),
  pickup_at timestamptz,
  return_at timestamptz,
  rental_days integer,
  daily_price_rs integer,
  extras_rs integer not null default 0,
  total_rs integer,
  status booking_status not null default 'ENQUIRY',
  payment_status payment_status not null default 'UNPAID',
  document_status document_status not null default 'NOT_SUBMITTED',
  upload_token text unique,
  upload_token_expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_dates_ordered
    check (return_at is null or pickup_at is null or return_at > pickup_at)
);

comment on table bookings is
  'One row per rental. Status/payment/document fields drive the flows in CLAUDE.md — see /lib/domain/bookingStatus.ts for the allowed-transitions map (enforced in application code, not here).';
comment on column bookings.booking_number is 'Readable ID, e.g. #1024 (display-time prefix; stored as a plain integer).';
comment on column bookings.rental_days is 'Computed by /lib/domain/calculateRentalDays — not derived in SQL, since the rule is configurable.';
comment on column bookings.total_rs is 'Computed by /lib/domain/calculatePrice at booking time; prices come only from vehicles.daily_price_rs and locations.extra_fee_rs, never invented.';
comment on column bookings.upload_token is 'Random, unguessable token for the document upload link; expires per upload_token_expires_at (72h from confirmBooking per Component 2).';

create index bookings_status_idx on bookings (status);
create index bookings_customer_idx on bookings (customer_id);
create index bookings_vehicle_idx on bookings (vehicle_id);
create index bookings_date_range_idx on bookings (pickup_at, return_at);

-- The safety net against double-booking a vehicle: even if application code
-- has a bug, Postgres itself refuses to let two non-cancelled, non-enquiry
-- bookings for the same vehicle have overlapping [pickup_at, return_at)
-- windows. btree_gist (enabled in the first migration) gives gist an
-- equality operator class for uuid so it can be combined with the range
-- overlap operator in one exclusion constraint.
alter table bookings
  add constraint bookings_no_overlapping_vehicle_time
  exclude using gist (
    vehicle_id with =,
    tstzrange(pickup_at, return_at, '[)') with &&
  )
  where (
    vehicle_id is not null
    and pickup_at is not null
    and return_at is not null
    and status not in ('CANCELLED', 'ENQUIRY')
  );

create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function set_updated_at();
