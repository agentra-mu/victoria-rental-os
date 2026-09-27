-- Enum types shared across tables. Kept centralized so every migration that
-- needs one references the same definition.

-- Booking status state machine (see CLAUDE.md). CANCELLED and NEEDS_HUMAN
-- are reachable from any active status; the allowed-transitions map itself
-- lives in application code (/lib/domain/bookingStatus.ts), not here — the
-- database only constrains which values are legal, not which transitions
-- between them are legal.
create type booking_status as enum (
  'ENQUIRY',
  'CAR_SELECTED',
  'DATES_SELECTED',
  'PENDING_DOCUMENTS',
  'DOCUMENTS_VERIFIED',
  'CONFIRMED',
  'PICKED_UP',
  'RETURNED',
  'COMPLETED',
  'CANCELLED',
  'NEEDS_HUMAN'
);

create type payment_status as enum ('UNPAID', 'PAID', 'REFUNDED');

create type document_status as enum (
  'NOT_SUBMITTED',
  'PENDING',
  'VERIFIED',
  'NEEDS_REVIEW',
  'REJECTED'
);

create type vehicle_status as enum ('ACTIVE', 'MAINTENANCE', 'RETIRED');

create type doc_type as enum ('PASSPORT', 'DRIVING_PERMIT');

-- Automated verification never rejects outright (see CLAUDE.md) — only
-- VERIFIED or NEEDS_REVIEW are produced by the system. REJECTED exists only
-- as a bookings.document_status value reachable through an authenticated
-- staff action, never written by document_verifications.result.
create type verification_result as enum ('VERIFIED', 'NEEDS_REVIEW');

create type payment_method as enum ('CASH');

create type conversation_mode as enum ('AI', 'HUMAN');

create type message_direction as enum ('INBOUND', 'OUTBOUND');

create type message_sender as enum ('customer', 'ai', 'owner');

create type owner_notification_type as enum (
  'DELAY',
  'PICKUP_CHANGE',
  'EXTENSION_REQUEST',
  'NEEDS_HUMAN',
  'DOC_REVIEW',
  'CASH_ISSUE'
);

create type owner_notification_status as enum ('OPEN', 'RESOLVED');

create type staff_role as enum ('OWNER', 'STAFF');

-- Who/what triggered a booking_events row.
create type booking_event_actor as enum ('ai', 'owner', 'customer', 'system');
