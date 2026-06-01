-- Trip Planner — Stage 7: live shared editing via Supabase Realtime.
-- Run in the Supabase SQL editor after the earlier migrations.
--
-- Adds the trip tables to the `supabase_realtime` publication so the browser
-- receives Postgres change events. RLS still governs what each client can read,
-- and the app re-fetches through normal (RLS-protected) queries on each event —
-- so this only controls *notification*, never data access. Idempotent.

do $$
declare
  t text;
begin
  foreach t in array array['trips','trip_members','places','areas','days','stops','budget_entries']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
