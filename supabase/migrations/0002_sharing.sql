-- Trip Planner — Stage 2: sharing
-- Run this in the Supabase SQL editor after 0001_init.sql.

-- ---------------------------------------------------------------------------
-- Let trip members read each other's profile (display name), so the members
-- list can show names instead of opaque ids. Own-profile read still works via
-- the policy from 0001; permissive policies OR together.
-- ---------------------------------------------------------------------------
create or replace function shares_trip_with(_other uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from trip_members me
    join trip_members them on them.trip_id = me.trip_id
    where me.user_id = auth.uid() and them.user_id = _other
  );
$$;

create policy "shared member profile read" on profiles
  for select using (shares_trip_with(id));

-- ---------------------------------------------------------------------------
-- Second FK on trip_members.user_id → profiles.id (a profile row exists for
-- every user via the signup trigger). This lets PostgREST embed the profile:
--   trip_members.select('role, profile:profiles(display_name)')
-- ---------------------------------------------------------------------------
alter table trip_members
  add constraint trip_members_user_id_profiles_fkey
  foreign key (user_id) references profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Invite by email. The client can't look up another user by email under RLS,
-- so the trip owner calls this. SECURITY DEFINER lets it read auth.users and
-- insert the membership; we re-check ownership inside.
--
-- Returns one of: 'added' | 'already_member' | 'no_account' | 'not_owner'.
-- ('no_account' = that email has no account yet — with sign-ups disabled, add
-- them in Supabase → Authentication → Users first.)
-- ---------------------------------------------------------------------------
create or replace function invite_member_by_email(_trip_id uuid, _email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid;
begin
  if not exists (
    select 1 from trips where id = _trip_id and owner_id = auth.uid()
  ) then
    return 'not_owner';
  end if;

  select id into _uid
  from auth.users
  where lower(email) = lower(trim(_email))
  limit 1;

  if _uid is null then
    return 'no_account';
  end if;

  if exists (
    select 1 from trip_members where trip_id = _trip_id and user_id = _uid
  ) then
    return 'already_member';
  end if;

  insert into trip_members (trip_id, user_id, role)
  values (_trip_id, _uid, 'editor');

  return 'added';
end;
$$;

grant execute on function invite_member_by_email(uuid, text) to authenticated;
