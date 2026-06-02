-- Trip Planner — Phase 0 polish: an optional cover emoji per trip (shown on the
-- dashboard cards and the trip header). Run in the Supabase SQL editor. Idempotent.
alter table trips add column if not exists cover_emoji text;
