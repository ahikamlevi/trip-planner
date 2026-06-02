-- Trip Planner — Stage 8: dietary restrictions + per-place dietary notes.
-- Run in the Supabase SQL editor after the earlier migrations. Idempotent.

-- Per-user dietary restrictions (array of tags, e.g. {'gluten','nuts'}) + a free note.
-- profiles are already cross-member readable (migration 0002), so both users can
-- see each other's restrictions when building the trip's allergy card.
alter table profiles add column if not exists dietary_restrictions text[] not null default '{}';
alter table profiles add column if not exists dietary_note text;

-- Per-place dietary note (e.g. "has a gluten-free menu", "ask about peanut oil").
alter table places add column if not exists dietary_notes text;

-- No new RLS or realtime needed: profiles and places already have member policies
-- and are in the supabase_realtime publication, so changes live-sync as before.
