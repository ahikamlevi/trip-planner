-- Self-service account deletion (GDPR "right to erasure"). Clients can't delete from
-- auth.users under RLS, so expose a SECURITY DEFINER RPC that deletes ONLY the caller's
-- own auth row. Every FK to auth.users is ON DELETE CASCADE, so this removes:
--   • the caller's profile (profiles.id → auth.users on delete cascade)
--   • trips they OWN and all their content (trips.owner_id → auth.users cascade →
--     areas/days/places/stops/budget_entries/day_references/trip_companions)
--   • their membership in trips shared by others (trip_members.user_id → auth.users
--     cascade); those trips remain for the other members.
-- Run in the Supabase SQL editor. Idempotent (replaces the function).

create or replace function delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Hardcoded to auth.uid() — never takes an id argument, so a caller can only ever
  -- delete their own account. A null uid (unauthenticated) matches nothing.
  delete from auth.users where id = auth.uid();
end;
$$;

-- Don't let anon/public call it; signed-in users only (it self-scopes via auth.uid()).
revoke all on function delete_account() from public;
revoke all on function delete_account() from anon;
grant execute on function delete_account() to authenticated;
