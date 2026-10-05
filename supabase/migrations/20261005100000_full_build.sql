-- Components 10–19: dashboard auth/RBAC, takeover, fleet, locations, change
-- requests, scheduled messages, audit log.

alter type owner_notification_type add value if not exists 'CHANGE_REQUEST';
alter type owner_notification_type add value if not exists 'ALERT';
alter type owner_notification_type add value if not exists 'REMINDER';

-- Staff -----------------------------------------------------------------
alter table staff_users add column if not exists email text;
alter table staff_users add column if not exists permissions jsonb not null default '{}'::jsonb;

-- Conversations (takeover, inbox) ----------------------------------------
alter table conversations add column if not exists assigned_to uuid references staff_users (id);
alter table conversations add column if not exists human_summary text;
alter table conversations add column if not exists last_owner_message_at timestamptz;
alter table conversations add column if not exists takeover_reminder_sent_at timestamptz;

-- Customers: opt-out of non-essential messages ----------------------------
alter table customers add column if not exists opted_out boolean not null default false;

-- Vehicles ---------------------------------------------------------------
alter table vehicles add column if not exists mileage integer not null default 0;
alter table vehicles add column if not exists current_location_id uuid references locations (id);
alter table vehicles add column if not exists last_service_at date;
alter table vehicles add column if not exists next_service_due date;
alter table vehicles add column if not exists insurance_expiry date;
alter table vehicles add column if not exists inspection_expiry date;
alter table vehicles add column if not exists notes text;
alter table vehicles add column if not exists photos jsonb not null default '[]'::jsonb;
alter table vehicles add column if not exists last_alert_key text;

create table if not exists vehicle_maintenance (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles (id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint vehicle_maintenance_ordered check (end_at > start_at)
);
create index if not exists vehicle_maintenance_vehicle_idx on vehicle_maintenance (vehicle_id, start_at);

-- Locations --------------------------------------------------------------
alter table locations add column if not exists after_hours_allowed boolean not null default false;
alter table locations add column if not exists after_hours_fee_rs integer not null default 0;
-- opening_hours shape: {"mon":["08:00","18:00"], "tue":[...], ... "sun":null}  (local Indian/Mauritius time; null/missing = closed)

-- Change requests ---------------------------------------------------------
create type change_request_type as enum (
  'RETURN_DELAY', 'PICKUP_TIME_CHANGE', 'RETURN_TIME_CHANGE',
  'EXTENSION', 'LOCATION_CHANGE', 'CANCELLATION'
);
create type change_request_status as enum ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED');

create table booking_change_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id),
  type change_request_type not null,
  requested_values jsonb not null default '{}'::jsonb,
  current_values jsonb not null default '{}'::jsonb,
  quoted_additional_rs integer not null default 0,
  availability_ok boolean not null default true,
  conflict_note text,
  status change_request_status not null default 'PENDING',
  decline_reason text,
  decided_by uuid references staff_users (id),
  decided_at timestamptz,
  customer_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index booking_change_requests_booking_idx on booking_change_requests (booking_id);
create index booking_change_requests_status_idx on booking_change_requests (status);

-- Scheduled messages / templates -------------------------------------------
create table scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings (id),
  kind text not null,
  sent_at timestamptz not null default now(),
  whatsapp_message_id text,
  status text not null default 'SENT',
  unique (booking_id, kind)
);

create table message_templates (
  kind text primary key,
  template_name text not null,
  language text not null default 'en',
  parameter_mapping jsonb not null default '[]'::jsonb
);

create table quick_replies (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- Audit log ------------------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid references staff_users (id),
  action text not null,
  entity text,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on audit_log (created_at desc);
revoke update, delete on audit_log from public;

-- RLS: tables are service-role only (the dashboard reads through server code).
alter table vehicle_maintenance enable row level security;
alter table booking_change_requests enable row level security;
alter table scheduled_messages enable row level security;
alter table message_templates enable row level security;
alter table quick_replies enable row level security;
alter table audit_log enable row level security;

-- Defence in depth: only OWNER staff may read the audit log directly.
create or replace function is_owner() returns boolean
language sql stable security definer as $$
  select exists (select 1 from staff_users where id = auth.uid() and role = 'OWNER' and active);
$$;
create policy audit_log_owner_read on audit_log for select to authenticated using (is_owner());

-- Maintenance blocks availability like a booking.
create extension if not exists btree_gist;
