-- Trip Planner — price for an editable travel leg. Sits alongside the other leg
-- overrides on the destination stop (travel_mode/_min/_dist_m/_note, migration 0013).
-- Feeds the budget totals (counted like a per-stop cost). Run in the Supabase SQL
-- editor. Idempotent.
alter table stops add column if not exists travel_cost numeric;  -- price of the ride into this stop
