-- Trip Planner — Stage 7 polish: a free-text note per day.
-- Run in the Supabase SQL editor after the earlier migrations.

alter table days add column if not exists note text;
