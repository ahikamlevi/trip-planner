-- Trip Planner — Phase 0 polish: per-place color label (Google-Calendar style) and
-- an auto-captured, user-editable city for filtering. Run in the Supabase SQL editor.
-- Idempotent.
alter table places add column if not exists color text;
alter table places add column if not exists city text;
