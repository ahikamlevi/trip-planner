-- Trip Planner — per-day "reference places". A reference is a place you want to keep an
-- eye on while planning a specific day (a hospital, police station, pharmacy, your
-- hotel) WITHOUT adding it to that day's route. Added/dragged per day; the day view then
-- shows the distance/time from the selected stop to each. Replaces the global
-- places.is_reference flag from 0020 (that column is now unused; left in place, harmless).
-- Run in the Supabase SQL editor. Idempotent.

-- Safety net: ensure the phone column exists even if 0020 was skipped (the place editor
-- + Nearby panel use it; the 0020 is_reference flag is no longer used by the app).
alter table places add column if not exists phone text;

create table if not exists day_references (
  id         uuid primary key default gen_random_uuid(),
  day_id     uuid not null references days(id) on delete cascade,
  place_id   uuid not null references places(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (day_id, place_id)
);

create index if not exists day_references_day_id_idx on day_references (day_id);

-- Scoped through the day's trip membership, exactly like stops.
alter table day_references enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'day_references' and policyname = 'member rw day_references') then
    create policy "member rw day_references" on day_references
      for all using (is_day_member(day_id)) with check (is_day_member(day_id));
  end if;
end $$;

-- Live sync (notification only; RLS still governs reads).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'day_references'
  ) then
    execute 'alter publication supabase_realtime add table public.day_references';
  end if;
end $$;
