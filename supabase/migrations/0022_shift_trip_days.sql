-- Trip Planner — shift every day in a trip by N days. Used by the trip editor when
-- the user changes the trip's start date (or anchors a template clone to their real
-- dates): the whole plan moves together so existing routes/stops/notes stay aligned.
-- Run in the Supabase SQL editor. Idempotent.
--
-- Why an RPC: PostgREST can't express `date = date + integer` in a single UPDATE — it
-- only accepts literal values for .update(). Doing it as N round-trips from the client
-- would be slow + non-atomic; this is one statement, atomic at the SQL level.
--
-- Why SECURITY DEFINER: we bypass RLS to do a single bulk UPDATE, but enforce trip
-- membership explicitly. (Equivalent in effect to the existing `member rw days` policy,
-- just expressed once at the entry point.)

create or replace function shift_trip_days(_trip_id uuid, _delta_days int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _affected int;
begin
  if not is_trip_member(_trip_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _delta_days = 0 then
    return 0;
  end if;
  update days set date = date + _delta_days where trip_id = _trip_id;
  get diagnostics _affected = row_count;
  return _affected;
end;
$$;

revoke all on function shift_trip_days(uuid, int) from public;
revoke all on function shift_trip_days(uuid, int) from anon;
grant execute on function shift_trip_days(uuid, int) to authenticated;
