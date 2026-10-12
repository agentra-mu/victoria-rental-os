-- Demo: let Supabase Realtime broadcast changes on the tables the live feed watches.
-- (No RLS read policies exist for anon/authenticated, so only service-role-backed
-- code sees data; the demo feed itself polls a server endpoint.)
do $$
declare t text;
begin
  foreach t in array array['bookings', 'messages', 'owner_notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
