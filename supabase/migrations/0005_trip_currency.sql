-- Trip Planner — Stage 6: a single currency per trip.
-- Run in the Supabase SQL editor after the earlier migrations.
--
-- Keeping one currency per trip avoids cross-currency math in the budget rollups.
-- budget_entries.currency still exists for flexibility, but the UI uses the trip
-- currency for display and new entries.

alter table trips add column if not exists currency text not null default 'USD';
