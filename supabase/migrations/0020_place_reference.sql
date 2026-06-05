-- Trip Planner — "reference places": places you want to keep an eye on while planning
-- (a hospital, police station, pharmacy, your hotel…) WITHOUT adding them to a day's
-- route. Each day's itinerary then shows the distance/time from the selected stop to
-- each reference place, plus a tap-to-call phone. Run in the Supabase SQL editor.
-- Idempotent.
alter table places add column if not exists is_reference boolean not null default false;
alter table places add column if not exists phone text;  -- tap-to-call (tel:) in the Nearby panel
