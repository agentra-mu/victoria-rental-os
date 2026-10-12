-- Demo only: lets scripts/reset-demo.ts restart the human-readable ID sequences
-- so a reset DB starts again at #1000 / CAR-001 / CUST-000001.
create or replace function demo_restart_sequences()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  alter sequence booking_number_seq restart with 1000;
  alter sequence vehicle_code_seq restart with 1;
  alter sequence customer_code_seq restart with 1;
end;
$$;

revoke all on function demo_restart_sequences() from public, anon, authenticated;
grant execute on function demo_restart_sequences() to service_role;
