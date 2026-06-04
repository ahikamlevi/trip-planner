-- Trip Planner — per-user rate limiting for the `discover` Edge Function, so one
-- signed-in user (or a bot, once public sign-ups open) can't drain the shared
-- Foursquare credits. Fixed-window counter keyed by (user, bucket, window).
-- Touched ONLY by the discover function via the service role — never by clients.
-- Run in the Supabase SQL editor. Idempotent. (No pg_cron needed: consume_rate_limit
-- prunes a user+bucket's older windows on each call, so the table stays tiny.)

create table if not exists api_rate_limit (
  user_id      uuid        not null,
  bucket       text        not null,            -- e.g. 'search' | 'details'
  window_start timestamptz not null,            -- floored to the window
  hits         int         not null default 0,
  primary key (user_id, bucket, window_start)
);

-- RLS on with NO policies → clients are fully blocked; only the service role
-- (which bypasses RLS) and the SECURITY DEFINER function below touch it.
alter table api_rate_limit enable row level security;

-- Atomically count one hit in the current fixed window and report whether the
-- caller is still within the limit. Returns true = allowed, false = over limit.
create or replace function consume_rate_limit(
  _user uuid, _bucket text, _limit int, _window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _ws   timestamptz := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);
  _hits int;
begin
  -- Cheap, indexed prune of this user+bucket's expired windows (no pg_cron required).
  delete from api_rate_limit
   where user_id = _user and bucket = _bucket and window_start < _ws;

  insert into api_rate_limit (user_id, bucket, window_start, hits)
  values (_user, _bucket, _ws, 1)
  on conflict (user_id, bucket, window_start)
  do update set hits = api_rate_limit.hits + 1
  returning hits into _hits;

  return _hits <= _limit;
end;
$$;

-- Only the Edge Function (service role) may call this. Block clients so they can't
-- pass an arbitrary _limit / _user to bypass or poison the counter.
revoke all on function consume_rate_limit(uuid, text, int, int) from public;
revoke all on function consume_rate_limit(uuid, text, int, int) from anon, authenticated;
grant execute on function consume_rate_limit(uuid, text, int, int) to service_role;
