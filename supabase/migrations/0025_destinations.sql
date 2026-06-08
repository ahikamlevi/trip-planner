-- Promote "areas" into full trip DESTINATIONS so a trip can show its multi-city route
-- (e.g. Rio → Santiago → Concepción → Santiago → Madrid → home). We reuse areas instead of
-- adding a parallel concept because days already link to an area (days.area_id), so a
-- destination naturally owns its days — drilling from a city into its daily plan is free.
-- A repeated city is just two destination rows (different order + dates). All new columns
-- are optional, so existing areas keep working. Run in the Supabase SQL editor. Idempotent.

alter table areas add column if not exists country        text;
alter table areas add column if not exists lat            double precision;
alter table areas add column if not exists lng            double precision;
alter table areas add column if not exists start_date     date;
alter table areas add column if not exists end_date       date;
-- The travel leg INTO this destination (how you arrive): flight/train/bus/car/ferry/other.
alter table areas add column if not exists transport_mode text;
alter table areas add column if not exists transport_note text;
alter table areas add column if not exists transport_cost numeric;

-- RLS (member rw) + realtime already cover the areas table from 0001/0007 — no change.
