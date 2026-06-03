-- Trip Planner — editable travel legs. Overrides for the leg arriving INTO each stop:
-- transport mode, a manual travel time / distance (replacing the auto OSRM values),
-- and a per-leg note. Run in the Supabase SQL editor. Idempotent.
alter table stops add column if not exists travel_mode text;       -- walk|car|train|bus|bike|other
alter table stops add column if not exists travel_min integer;     -- manual travel minutes (overrides auto)
alter table stops add column if not exists travel_dist_m integer;  -- manual distance in metres (overrides auto)
alter table stops add column if not exists travel_note text;       -- e.g. "platform 4", "buy ticket ahead"
