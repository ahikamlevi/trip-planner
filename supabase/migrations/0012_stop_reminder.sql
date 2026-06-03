-- Trip Planner — per-stop reminder: minutes before arrival_time to alert.
-- Used to generate calendar (.ics) alarms. Run in the Supabase SQL editor. Idempotent.
alter table stops add column if not exists reminder_min integer;
