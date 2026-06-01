-- Trip Planner — Stage 4 follow-up: reusable places with per-visit cost.
-- Run in the Supabase SQL editor after the earlier migrations.
--
-- A place can now be scheduled on many days (one place → many stops). Cost is
-- tracked per visit on the stop, pre-filled from the place's est_cost but freely
-- editable: a restaurant keeps a cost on each visit (counts every time); a hotel
-- you return to gets its cost cleared on repeat nights (counts once).

alter table stops add column if not exists cost numeric;
