-- Trip Planner — Stage 7: trip-level notes + a shared packing checklist.
-- Run in the Supabase SQL editor after the earlier migrations. Idempotent.

-- Trip-level free-text notes (owner-editable via the trips update policy).
alter table trips add column if not exists notes text;

-- Shared packing checklist — any trip member can add/check/remove items.
create table if not exists packing_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips (id) on delete cascade,
  label      text not null,
  packed     boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists packing_items_trip_idx on packing_items (trip_id);

alter table packing_items enable row level security;

drop policy if exists "member rw packing" on packing_items;
create policy "member rw packing" on packing_items
  for all using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));

-- Live sync for the checklist.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'packing_items'
  ) then
    execute 'alter publication supabase_realtime add table public.packing_items';
  end if;
end $$;
