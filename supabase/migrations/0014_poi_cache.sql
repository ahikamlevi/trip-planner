-- POI discovery cache: stores discovery (Foursquare) results keyed by query + snapped
-- viewport so repeat searches don't burn API quota. Written/read ONLY by the `discover`
-- Edge Function via the service role (which bypasses RLS) — clients have no access.
-- Run in the Supabase SQL editor. Idempotent.
create table if not exists poi_cache (
  cache_key  text primary key,
  results    jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table poi_cache enable row level security;
-- Intentionally no policies: clients are blocked; the Edge Function uses the service
-- role key (bypasses RLS) to read/write this cache.
