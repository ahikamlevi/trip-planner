-- Trip Planner — trip "companions": people on the trip who do NOT have an app account
-- (children, a partner/grandparent who doesn't use the app). Allergies were previously
-- stored only on profiles.dietary_restrictions, i.e. one allergy profile per logged-in
-- user — so a child travelling with the planner had nowhere to record an allergy. A
-- companion is a per-trip person with the same allergen/diet tags + note, editable by any
-- trip member, and merged with the account-members on the printable allergy card.
-- Run in the Supabase SQL editor. Idempotent.

create table if not exists trip_companions (
  id                   uuid primary key default gen_random_uuid(),
  trip_id              uuid not null references trips(id) on delete cascade,
  name                 text not null,
  dietary_restrictions text[] not null default '{}',
  dietary_note         text,
  created_by           uuid references auth.users(id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now()
);

create index if not exists trip_companions_trip_id_idx on trip_companions (trip_id);

-- Any member of the trip can read/write its companions (the planner manages everyone's
-- allergies), exactly like packing_items / budget_entries.
alter table trip_companions enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'trip_companions' and policyname = 'member rw trip_companions') then
    create policy "member rw trip_companions" on trip_companions
      for all using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));
  end if;
end $$;

-- Live sync (notification only; RLS still governs reads).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_companions'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_companions';
  end if;
end $$;
