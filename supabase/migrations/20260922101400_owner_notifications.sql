create table owner_notifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings (id),
  type owner_notification_type not null,
  title text not null,
  body text,
  status owner_notification_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  resolved_by uuid references staff_users (id),
  resolved_at timestamptz
);

comment on table owner_notifications is
  'Things that need a human: delays, pickup changes, extension requests, escalations, document review, cash issues. booking_id is nullable because not every notification is booking-scoped.';

create index owner_notifications_status_idx on owner_notifications (status);
create index owner_notifications_booking_idx on owner_notifications (booking_id);
