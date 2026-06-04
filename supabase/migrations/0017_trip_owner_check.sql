-- Pin trip ownership. The original UPDATE policy (0001) had a USING clause but no
-- WITH CHECK, so an owner could set owner_id to another user and silently orphan
-- the trip (they'd lose owner-only abilities; the trip can't be reassigned back via
-- the client). Recreate the policy with a WITH CHECK so the row must STILL be owned
-- by the caller after the update. Idempotent.
drop policy if exists "owner updates trip" on trips;
create policy "owner updates trip" on trips
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
