-- Seed data for local development / testing. Applied automatically by
-- `supabase db reset` after migrations. Not for production — the rental
-- company's real fleet, locations and knowledge base replace this before
-- launch (see LAUNCH_CHECKLIST.md, added in Component 20).
--
-- Dates are written relative to a fixed "today" (2026-09-22) so the seeded
-- bookings stay meaningfully placed (past/ongoing/upcoming) for as long as
-- reasonably possible without needing to regenerate this file constantly.

-- ---------------------------------------------------------------------
-- A local-dev-only "owner" account, so seeded bookings can have a real
-- marked_paid_by / reviewed_by. In a real Supabase project, auth.users
-- rows come from actual sign-ups (Supabase Auth) — inserting into it
-- directly like this only works against a local Postgres/Supabase CLI
-- stack, never production.
-- ---------------------------------------------------------------------
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000001', 'owner@victoriacarrental.mu')
on conflict (id) do nothing;

insert into staff_users (id, name, role)
values ('00000000-0000-0000-0000-000000000001', 'Victoria (Owner)', 'OWNER')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Locations (6)
-- ---------------------------------------------------------------------
insert into locations (name, is_pickup, is_dropoff, opening_hours, instructions, google_maps_url, extra_fee_rs, active)
values
  ('SSR International Airport', true, true,
   '{"mon":"06:00-22:00","tue":"06:00-22:00","wed":"06:00-22:00","thu":"06:00-22:00","fri":"06:00-22:00","sat":"06:00-22:00","sun":"06:00-22:00"}',
   'Meet at the car rental counter in the arrivals hall. Call on arrival if you can''t find us.',
   'https://maps.google.com/?q=SSR+International+Airport+Mauritius', 500, true),
  ('Grand Baie', true, true,
   '{"mon":"08:00-18:00","tue":"08:00-18:00","wed":"08:00-18:00","thu":"08:00-18:00","fri":"08:00-18:00","sat":"08:00-13:00","sun":"closed"}',
   'Office next to the Grand Baie bus station.',
   'https://maps.google.com/?q=Grand+Baie+Mauritius', 0, true),
  ('Port Louis', true, true,
   '{"mon":"08:00-17:00","tue":"08:00-17:00","wed":"08:00-17:00","thu":"08:00-17:00","fri":"08:00-17:00","sat":"08:00-12:00","sun":"closed"}',
   'Near Caudan Waterfront — ask reception to call us on arrival.',
   'https://maps.google.com/?q=Caudan+Waterfront+Port+Louis', 0, true),
  ('Flic-en-Flac', true, true,
   '{"mon":"08:00-18:00","tue":"08:00-18:00","wed":"08:00-18:00","thu":"08:00-18:00","fri":"08:00-18:00","sat":"08:00-18:00","sun":"08:00-13:00"}',
   'Opposite the public beach entrance.',
   'https://maps.google.com/?q=Flic+en+Flac+Mauritius', 0, true),
  ('Quatre Bornes', true, true,
   '{"mon":"08:00-17:00","tue":"08:00-17:00","wed":"08:00-17:00","thu":"08:00-17:00","fri":"08:00-17:00","sat":"08:00-12:00","sun":"closed"}',
   'Behind the Quatre Bornes market.',
   'https://maps.google.com/?q=Quatre+Bornes+Mauritius', 0, true),
  ('Tamarin', true, true,
   '{"mon":"08:00-18:00","tue":"08:00-18:00","wed":"08:00-18:00","thu":"08:00-18:00","fri":"08:00-18:00","sat":"08:00-13:00","sun":"closed"}',
   'Near Tamarin Bay, ask for La Villa car park.',
   'https://maps.google.com/?q=Tamarin+Mauritius', 0, true);

-- ---------------------------------------------------------------------
-- Vehicle categories
-- ---------------------------------------------------------------------
insert into vehicle_categories (name, description)
values
  ('Economy', 'Compact, fuel-efficient cars — best value for city driving.'),
  ('Sedan', 'Comfortable mid-size cars for longer trips.'),
  ('SUV', 'Higher clearance, more space — good for exploring the island.'),
  ('Van', 'Group and family travel, extra luggage space.');

-- ---------------------------------------------------------------------
-- Vehicles (6), one home location each
-- ---------------------------------------------------------------------
insert into vehicles (make, model, category_id, registration, transmission, seats, daily_price_rs, home_location_id, status)
select 'Toyota', 'Vitz', vc.id, '1001 MU 26', 'Automatic', 5, 1200, l.id, 'ACTIVE'
from vehicle_categories vc, locations l
where vc.name = 'Economy' and l.name = 'SSR International Airport';

insert into vehicles (make, model, category_id, registration, transmission, seats, daily_price_rs, home_location_id, status)
select 'Suzuki', 'Swift', vc.id, '1002 MU 26', 'Manual', 5, 1300, l.id, 'ACTIVE'
from vehicle_categories vc, locations l
where vc.name = 'Economy' and l.name = 'Grand Baie';

insert into vehicles (make, model, category_id, registration, transmission, seats, daily_price_rs, home_location_id, status)
select 'Toyota', 'Corolla', vc.id, '1003 MU 26', 'Automatic', 5, 1800, l.id, 'ACTIVE'
from vehicle_categories vc, locations l
where vc.name = 'Sedan' and l.name = 'Port Louis';

insert into vehicles (make, model, category_id, registration, transmission, seats, daily_price_rs, home_location_id, status)
select 'Suzuki', 'Vitara', vc.id, '1004 MU 26', 'Automatic', 5, 2500, l.id, 'ACTIVE'
from vehicle_categories vc, locations l
where vc.name = 'SUV' and l.name = 'Flic-en-Flac';

insert into vehicles (make, model, category_id, registration, transmission, seats, daily_price_rs, home_location_id, status)
select 'Nissan', 'X-Trail', vc.id, '1005 MU 26', 'Automatic', 5, 2800, l.id, 'ACTIVE'
from vehicle_categories vc, locations l
where vc.name = 'SUV' and l.name = 'Quatre Bornes';

insert into vehicles (make, model, category_id, registration, transmission, seats, daily_price_rs, home_location_id, status)
select 'Toyota', 'Hiace', vc.id, '1006 MU 26', 'Manual', 12, 3500, l.id, 'ACTIVE'
from vehicle_categories vc, locations l
where vc.name = 'Van' and l.name = 'Tamarin';

-- ---------------------------------------------------------------------
-- Customers (3)
-- ---------------------------------------------------------------------
insert into customers (whatsapp_number, full_name, email)
values
  ('+23057611111', 'Jean Baptiste', 'jean.baptiste@example.com'),
  ('+23057622222', 'Marie Perrine', null),
  ('+23057633333', 'Rajesh Sharma', 'rajesh.sharma@example.com');

-- ---------------------------------------------------------------------
-- Bookings (5), spanning the pipeline: ENQUIRY, DATES_SELECTED,
-- PENDING_DOCUMENTS, CONFIRMED, COMPLETED (+ a payment on the completed
-- one, going through the legitimate payments-row-first path).
-- ---------------------------------------------------------------------

-- 1) Jean — ENQUIRY, nothing selected yet.
insert into bookings (customer_id, status)
select c.id, 'ENQUIRY'
from customers c where c.whatsapp_number = '+23057611111';

-- 2) Marie — DATES_SELECTED: car and dates chosen, not yet confirmed.
insert into bookings (customer_id, vehicle_id, pickup_location_id, dropoff_location_id, pickup_at, return_at, rental_days, daily_price_rs, total_rs, status)
select c.id, v.id, l.id, l.id,
  timestamptz '2026-10-05 10:00:00+04', timestamptz '2026-10-09 10:00:00+04',
  4, v.daily_price_rs, 4 * v.daily_price_rs, 'DATES_SELECTED'
from customers c, vehicles v, locations l
where c.whatsapp_number = '+23057622222'
  and v.registration = '1002 MU 26'
  and l.name = 'Grand Baie';

-- 3) Rajesh — PENDING_DOCUMENTS: confirmed dates, waiting on document
--    upload, upload_token generated (72h expiry per Component 2).
insert into bookings (customer_id, vehicle_id, pickup_location_id, dropoff_location_id, pickup_at, return_at, rental_days, daily_price_rs, total_rs, status, document_status, upload_token, upload_token_expires_at)
select c.id, v.id, lp.id, ld.id,
  timestamptz '2026-09-28 09:00:00+04', timestamptz '2026-10-02 09:00:00+04',
  4, v.daily_price_rs, 4 * v.daily_price_rs, 'PENDING_DOCUMENTS', 'PENDING',
  encode(gen_random_bytes(24), 'hex'), now() + interval '72 hours'
from customers c, vehicles v, locations lp, locations ld
where c.whatsapp_number = '+23057633333'
  and v.registration = '1004 MU 26'
  and lp.name = 'Flic-en-Flac' and ld.name = 'Flic-en-Flac';

-- 4) Jean — CONFIRMED: documents verified, cash due at pickup, still
--    upcoming and unpaid.
with b as (
  insert into bookings (customer_id, vehicle_id, pickup_location_id, dropoff_location_id, pickup_at, return_at, rental_days, daily_price_rs, total_rs, status, document_status)
  select c.id, v.id, l.id, l.id,
    timestamptz '2026-10-12 10:00:00+04', timestamptz '2026-10-17 10:00:00+04',
    5, v.daily_price_rs, 5 * v.daily_price_rs, 'CONFIRMED', 'VERIFIED'
  from customers c, vehicles v, locations l
  where c.whatsapp_number = '+23057611111'
    and v.registration = '1001 MU 26'
    and l.name = 'SSR International Airport'
  returning id, customer_id
),
docs as (
  insert into documents (booking_id, customer_id, doc_type, storage_path, mime_type)
  select b.id, b.customer_id, 'PASSPORT'::doc_type, 'documents/' || b.id || '/passport-seed.jpg', 'image/jpeg' from b
  union all
  select b.id, b.customer_id, 'DRIVING_PERMIT'::doc_type, 'documents/' || b.id || '/permit-seed.jpg', 'image/jpeg' from b
  returning id, doc_type
)
insert into document_verifications (document_id, extracted_name, extracted_dob, document_number, expiry_date, detected_doc_type, name_match_score, confidence, result, reviewed_by, reviewed_at)
select docs.id, 'Jean Baptiste', date '1988-04-12', 'P1234567', date '2030-01-01', docs.doc_type, 1.000, 0.970, 'VERIFIED',
  '00000000-0000-0000-0000-000000000001', now()
from docs;

-- 5) Marie — COMPLETED: past rental, documents verified, and paid —
--    going through the same insert-payments-row-then-update-status path
--    the real markAsPaid() domain function uses (see Component 9), so the
--    require_payment_row_for_paid trigger is satisfied the legitimate way,
--    not bypassed.
--
--    Split into two top-level statements on purpose: a data-modifying CTE
--    and the primary statement can't both target `bookings` in one
--    statement and reliably see each other's effects (they run against the
--    same snapshot) — so the insert and the final status update below are
--    deliberately separate statements, not one WITH chain.
with b as (
  insert into bookings (customer_id, vehicle_id, pickup_location_id, dropoff_location_id, pickup_at, return_at, rental_days, daily_price_rs, total_rs, status, document_status)
  select c.id, v.id, l.id, l.id,
    timestamptz '2026-08-01 10:00:00+04', timestamptz '2026-08-06 10:00:00+04',
    5, v.daily_price_rs, 5 * v.daily_price_rs, 'RETURNED', 'VERIFIED'
  from customers c, vehicles v, locations l
  where c.whatsapp_number = '+23057622222'
    and v.registration = '1003 MU 26'
    and l.name = 'Port Louis'
  returning id, customer_id, total_rs
),
docs as (
  insert into documents (booking_id, customer_id, doc_type, storage_path, mime_type)
  select b.id, b.customer_id, 'PASSPORT', 'documents/' || b.id || '/passport-seed.jpg', 'image/jpeg' from b
  returning id
),
verified as (
  insert into document_verifications (document_id, extracted_name, extracted_dob, document_number, expiry_date, detected_doc_type, name_match_score, confidence, result, reviewed_by, reviewed_at)
  select docs.id, 'Marie Perrine', date '1992-11-03', 'P7654321', date '2029-06-15', 'PASSPORT', 1.000, 0.980, 'VERIFIED',
    '00000000-0000-0000-0000-000000000001', now()
  from docs
  returning 1
)
insert into payments (booking_id, amount_rs, method, marked_paid_by)
select b.id, b.total_rs, 'CASH', '00000000-0000-0000-0000-000000000001' from b;

update bookings set status = 'COMPLETED', payment_status = 'PAID'
where customer_id = (select id from customers where whatsapp_number = '+23057622222')
  and vehicle_id = (select id from vehicles where registration = '1003 MU 26')
  and status = 'RETURNED';

-- ---------------------------------------------------------------------
-- Knowledge base (15 entries)
-- ---------------------------------------------------------------------
insert into knowledge_base (topic, question, answer, active)
values
  ('hours', 'What are your opening hours?',
   'Most of our locations are open 08:00-18:00 Monday to Saturday, with shorter hours on Sunday. The airport counter is open 06:00-22:00 every day. Exact hours depend on the pickup location.', true),
  ('payment', 'How do I pay?',
   'Payment is cash only, made in Mauritian Rupees (Rs) when you collect the vehicle. We don''t take card payments or deposits in advance.', true),
  ('payment', 'Can I pay by card or bank transfer?',
   'Not at the moment — we only accept cash, paid at pickup. If that''s difficult for you, let us know and a team member will help.', true),
  ('requirements', 'What do I need to rent a car?',
   'A valid passport or national ID, a valid driving permit/licence held for at least 1 year, and to be at least 21 years old. You''ll upload photos of your documents via a secure link after booking.', true),
  ('requirements', 'Can I rent if I''m under 21?',
   'Our standard minimum age is 21. If you''re younger, message us and we''ll check what''s possible with your specific documents.', true),
  ('fuel', 'What is the fuel policy?',
   'Vehicles are provided with a full tank and should be returned full. If it''s returned with less fuel, a refuelling charge applies.', true),
  ('mileage', 'Is there a mileage limit?',
   'Our rentals include unlimited mileage on the island — drive as much as you like.', true),
  ('cancellation', 'What is your cancellation policy?',
   'You can cancel free of charge up until 24 hours before pickup. Cancelling later or not showing up may incur a charge — ask us for the specifics for your booking.', true),
  ('late-returns', 'What happens if I return the car late?',
   'A short grace period is allowed. Beyond that, a late fee applies per hour or per extra day. Message us as early as possible if you think you''ll be late so we can help.', true),
  ('documents', 'Why do you need my passport and licence?',
   'Mauritian rental regulations require us to verify the identity and driving licence of every renter. Your documents are stored securely and only used for this purpose.', true),
  ('documents', 'Is my document upload secure?',
   'Yes — uploads go through a private, encrypted link tied only to your booking, and documents are stored in private storage that only authorised staff can access.', true),
  ('extras', 'Do you offer child seats?',
   'Yes, child seats are available on request — let us know when booking so we can reserve one for your vehicle.', true),
  ('extras', 'Can I add an additional driver?',
   'Yes, an additional driver can be added — they''ll also need to provide a valid driving licence for verification.', true),
  ('insurance', 'Is insurance included?',
   'Yes, all rentals include basic insurance coverage. Ask us about the excess amount and optional coverage upgrades for your specific vehicle.', true),
  ('breakdown', 'What if the car breaks down?',
   'Message us immediately on WhatsApp or call the number provided in your booking confirmation — we''ll arrange assistance or a replacement vehicle as quickly as possible.', true);
