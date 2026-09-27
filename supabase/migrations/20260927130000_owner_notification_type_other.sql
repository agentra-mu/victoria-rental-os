-- Component 5's record_customer_update tool needs a catch-all bucket for
-- customer requests that aren't a delay, pickup-time change or extension
-- (e.g. "can I add a child seat?"), without overloading NEEDS_HUMAN (which
-- is reserved for explicit takeover requests — see /lib/whatsapp/inbound.ts).
alter type owner_notification_type add value if not exists 'OTHER';
