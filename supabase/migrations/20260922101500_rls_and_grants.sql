-- Row Level Security, applied uniformly across every table in this schema.
--
-- Rule (per CLAUDE.md): the anon key gets nothing at all; authenticated
-- staff (rows in staff_users) can read everything; all writes go through
-- the service role, which bypasses RLS in Supabase (the `service_role` role
-- has BYPASSRLS) and is never exposed to the browser (see
-- /lib/supabase/server.ts). So every table below gets:
--   - RLS enabled and FORCED (forcing matters if anything ever runs as the
--     table owner instead of service_role; service_role bypasses it either
--     way via BYPASSRLS).
--   - No table-level grants to anon at all.
--   - SELECT-only grant to authenticated, gated by a policy that checks the
--     caller is an active row in staff_users.
--   - No INSERT/UPDATE/DELETE policy for anyone but service_role — since
--     service_role bypasses RLS, simply not writing such a policy is
--     sufficient to deny it to anon/authenticated (Postgres RLS defaults to
--     deny). This matches Component 10's rule that all dashboard mutations
--     go through server actions using the service-role client, never
--     directly from browser code.

-- staff_users' own SELECT policy needs to check staff_users, which would
-- normally make Postgres detect "infinite recursion in policy" (a policy
-- can't directly re-query the table it protects). The fix, per Supabase's
-- own docs, is a SECURITY DEFINER helper: it runs with the privileges of
-- its owner (not the calling `authenticated` role), so its internal query
-- against staff_users is not itself subject to this policy.
create or replace function is_active_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from staff_users su
    where su.id = auth.uid() and su.active
  );
$$;

comment on function is_active_staff() is
  'SECURITY DEFINER: used inside RLS policies (including on staff_users itself) to check staff membership without triggering recursive RLS evaluation. Do not inline this EXISTS query directly into a policy on staff_users — that causes "infinite recursion detected in policy".';

revoke all on function is_active_staff() from public;
grant execute on function is_active_staff() to authenticated, service_role;

do $$
declare
  t text;
  tables text[] := array[
    'customers',
    'vehicle_categories',
    'vehicles',
    'locations',
    'bookings',
    'booking_events',
    'documents',
    'document_verifications',
    'payments',
    'conversations',
    'messages',
    'knowledge_base',
    'owner_notifications',
    'staff_users'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);

    -- No table-level privileges for anon at all.
    execute format('revoke all on %I from anon', t);

    -- authenticated gets SELECT at the grant level; the policy below then
    -- restricts it to staff.
    execute format('revoke all on %I from authenticated', t);
    execute format('grant select on %I to authenticated', t);

    execute format(
      'create policy staff_select on %I for select to authenticated using (is_active_staff())',
      t
    );
  end loop;
end;
$$;

comment on schema public is
  'RLS: anon has zero access to every table; authenticated (staff) has SELECT only, gated by is_active_staff(). All writes happen through the service-role Supabase client in server-side code — see /lib/supabase/server.ts and CLAUDE.md.';
