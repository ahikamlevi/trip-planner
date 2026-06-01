-- Trip Planner — initial schema + Row Level Security
-- Run this in the Supabase SQL editor (or via the Supabase CLI) for a fresh project.
--
-- Security model: every data row is reachable only by members of its trip.
-- Membership lives in trip_members. RLS is enforced on every table.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type trip_role as enum ('owner', 'editor');
create type place_category as enum ('food', 'sight', 'beach', 'hotel', 'transport');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

create table trips (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  country    text,
  start_date date,
  end_date   date,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table trip_members (
  trip_id    uuid not null references trips (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       trip_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table areas (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips (id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table days (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips (id) on delete cascade,
  date       date not null,
  area_id    uuid references areas (id) on delete set null,
  created_at timestamptz not null default now()
);

create table places (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references trips (id) on delete cascade,
  name            text not null,
  lat             double precision,
  lng             double precision,
  category        place_category not null default 'sight',
  google_place_id text,
  notes           text,
  opening_hours   text,
  est_cost        numeric,
  scheduled       boolean not null default false,
  created_at      timestamptz not null default now()
);

create table stops (
  id           uuid primary key default gen_random_uuid(),
  day_id       uuid not null references days (id) on delete cascade,
  place_id     uuid not null references places (id) on delete cascade,
  sort_order   integer not null default 0,
  arrival_time time,
  duration_min integer,
  created_at   timestamptz not null default now()
);

create table route_cache (
  id         uuid primary key default gen_random_uuid(),
  origin     text not null,
  dest       text not null,
  mode       text not null,
  distance   numeric,
  duration   numeric,
  fetched_at timestamptz not null default now(),
  unique (origin, dest, mode)
);

create table budget_entries (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips (id) on delete cascade,
  area_id    uuid references areas (id) on delete set null,
  day_id     uuid references days (id) on delete set null,
  category   text not null,
  amount     numeric not null,
  currency   text not null default 'USD',
  note       text,
  created_at timestamptz not null default now()
);

-- Helpful indexes for the trip-scoped lookups RLS and the app both make.
create index on trip_members (user_id);
create index on areas (trip_id);
create index on days (trip_id);
create index on places (trip_id);
create index on stops (day_id);
create index on budget_entries (trip_id);

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER so they can read trip_members without
-- tripping the policies that call them — avoids RLS recursion).
-- ---------------------------------------------------------------------------
create or replace function is_trip_member(_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from trip_members
    where trip_id = _trip_id and user_id = auth.uid()
  );
$$;

create or replace function is_day_member(_day_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from days d
    join trip_members m on m.trip_id = d.trip_id
    where d.id = _day_id and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Triggers: auto-create a profile on signup, and add the trip owner as a member.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function handle_new_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (trip_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_trip_created
  after insert on trips
  for each row execute function handle_new_trip();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles       enable row level security;
alter table trips          enable row level security;
alter table trip_members   enable row level security;
alter table areas          enable row level security;
alter table days           enable row level security;
alter table places         enable row level security;
alter table stops          enable row level security;
alter table route_cache    enable row level security;
alter table budget_entries enable row level security;

-- profiles: you can see and edit your own profile.
create policy "own profile read"   on profiles for select using (id = auth.uid());
create policy "own profile upsert" on profiles for insert with check (id = auth.uid());
create policy "own profile update" on profiles for update using (id = auth.uid());

-- trips: members can read; the owner creates and manages.
create policy "member reads trip"  on trips for select using (is_trip_member(id));
create policy "owner creates trip" on trips for insert with check (owner_id = auth.uid());
create policy "owner updates trip" on trips for update using (owner_id = auth.uid());
create policy "owner deletes trip" on trips for delete using (owner_id = auth.uid());

-- trip_members: members can see the roster; the trip owner manages it.
create policy "member reads roster" on trip_members for select using (is_trip_member(trip_id));
create policy "owner adds member"   on trip_members for insert
  with check (exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid()));
create policy "owner updates member" on trip_members for update
  using (exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid()));
create policy "owner removes member" on trip_members for delete
  using (exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid()));

-- Trip-scoped content: any member can read and write.
create policy "member rw areas"  on areas
  for all using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));
create policy "member rw days"   on days
  for all using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));
create policy "member rw places" on places
  for all using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));
create policy "member rw budget" on budget_entries
  for all using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));

-- stops are scoped through their day.
create policy "member rw stops" on stops
  for all using (is_day_member(day_id)) with check (is_day_member(day_id));

-- route_cache: any signed-in user may read cached routes; only the server
-- (service_role, which bypasses RLS) writes them. No write policy on purpose.
create policy "authenticated reads route cache" on route_cache
  for select using (auth.role() = 'authenticated');
