create table booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id),
  event_type text not null,
  old_value text,
  new_value text,
  actor booking_event_actor not null default 'system',
  actor_user_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

comment on table booking_events is
  'Append-only audit trail of booking changes. Populated automatically by triggers on bookings below, and may also be written explicitly by application code for events that are not column changes (e.g. a customer message).';

create index booking_events_booking_idx on booking_events (booking_id, created_at);

-- Append-only: revoke update/delete from everyone except the service role
-- (which bypasses RLS/grants entirely in Supabase). No RLS policy is added
-- for UPDATE/DELETE in the RLS migration either, so staff cannot alter
-- history even with a future write policy on other tables.
revoke update, delete on booking_events from public;

-- Actor attribution: application code sets these two session variables
-- before running a statement that changes a booking, e.g.
--   select set_config('app.actor', 'owner', true);
--   select set_config('app.actor_user_id', staff_user_id::text, true);
-- If unset, the trigger falls back to 'system' with no actor_user_id, which
-- is correct for direct SQL/console changes and for the service role
-- acting without a specific staff member in context.
create or replace function current_booking_event_actor()
returns booking_event_actor
language sql
stable
as $$
  select coalesce(nullif(current_setting('app.actor', true), '')::booking_event_actor, 'system'::booking_event_actor);
$$;

create or replace function current_booking_event_actor_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.actor_user_id', true), '')::uuid;
$$;

create or replace function log_booking_event()
returns trigger
language plpgsql
as $$
declare
  v_actor booking_event_actor := current_booking_event_actor();
  v_actor_user_id uuid := current_booking_event_actor_user_id();
begin
  if tg_op = 'INSERT' then
    insert into booking_events (booking_id, event_type, new_value, actor, actor_user_id, payload)
    values (
      new.id,
      'BOOKING_CREATED',
      new.status::text,
      v_actor,
      v_actor_user_id,
      jsonb_build_object('booking_number', new.booking_number)
    );
    return new;
  end if;

  -- tg_op = 'UPDATE': one row per tracked column that actually changed.
  if new.status is distinct from old.status then
    insert into booking_events (booking_id, event_type, old_value, new_value, actor, actor_user_id)
    values (new.id, 'STATUS_CHANGED', old.status::text, new.status::text, v_actor, v_actor_user_id);
  end if;

  if new.payment_status is distinct from old.payment_status then
    insert into booking_events (booking_id, event_type, old_value, new_value, actor, actor_user_id)
    values (new.id, 'PAYMENT_STATUS_CHANGED', old.payment_status::text, new.payment_status::text, v_actor, v_actor_user_id);
  end if;

  if new.document_status is distinct from old.document_status then
    insert into booking_events (booking_id, event_type, old_value, new_value, actor, actor_user_id)
    values (new.id, 'DOCUMENT_STATUS_CHANGED', old.document_status::text, new.document_status::text, v_actor, v_actor_user_id);
  end if;

  if new.vehicle_id is distinct from old.vehicle_id then
    insert into booking_events (booking_id, event_type, old_value, new_value, actor, actor_user_id)
    values (new.id, 'VEHICLE_REASSIGNED', old.vehicle_id::text, new.vehicle_id::text, v_actor, v_actor_user_id);
  end if;

  if new.pickup_at is distinct from old.pickup_at then
    insert into booking_events (booking_id, event_type, old_value, new_value, actor, actor_user_id)
    values (new.id, 'PICKUP_AT_CHANGED', old.pickup_at::text, new.pickup_at::text, v_actor, v_actor_user_id);
  end if;

  if new.return_at is distinct from old.return_at then
    insert into booking_events (booking_id, event_type, old_value, new_value, actor, actor_user_id)
    values (new.id, 'RETURN_AT_CHANGED', old.return_at::text, new.return_at::text, v_actor, v_actor_user_id);
  end if;

  return new;
end;
$$;

create trigger bookings_log_insert
  after insert on bookings
  for each row execute function log_booking_event();

create trigger bookings_log_update
  after update on bookings
  for each row execute function log_booking_event();
