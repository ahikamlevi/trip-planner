-- Trip Planner — Stage 5: routing cache writes.
-- Run in the Supabase SQL editor after the earlier migrations.
--
-- OSRM's public server needs no API key, so the browser calls it directly and
-- writes the result into route_cache to avoid refetching. That requires
-- insert/update policies (0001 only granted SELECT). Cached rows are just
-- distance/duration between coordinates — not trip-scoped or sensitive — so any
-- signed-in user may write them.
--
-- NOTE: when we later add a *billable* provider (Google/Mapbox), that one moves
-- behind an Edge Function (service_role) so its key stays server-side; these
-- client write policies stay fine for the keyless OSRM path.

create policy "authenticated writes route cache" on route_cache
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated updates route cache" on route_cache
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
