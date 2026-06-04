-- Identify trip members by email when they haven't set a display name.
-- profiles previously stored only display_name (null for hand-created accounts),
-- so the members list showed "Unnamed traveler" for everyone. Email lives in
-- auth.users, which the client can't read under RLS — so mirror it onto profiles.
alter table profiles add column if not exists email text;

-- Backfill existing profiles from auth.users.
update profiles p
set email = u.email
from auth.users u
where u.id = p.id and (p.email is null or p.email is distinct from u.email);

-- Capture the email on new signups (extends the existing handle_new_user trigger).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, new.raw_user_meta_data ->> 'display_name', new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Keep profiles.email in sync if a user later changes their auth email.
create or replace function handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function handle_user_email_change();

-- Note: profiles.email is readable by fellow trip members via the existing
-- "shared member profile read" policy (0002). That's intended — members invited
-- each other by email, so showing it back to identify the roster is acceptable.
