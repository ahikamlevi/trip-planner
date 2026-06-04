-- Expand the place_category enum so adding a place offers the same rich set as
-- discovery (cafe, bar, museum, outdoors, shopping, + the service categories that
-- previously collapsed into the generic 'sight' bucket), plus a free-text 'other'.
-- Postgres allows ADD VALUE IF NOT EXISTS, so this is idempotent. (PG12+ permits it
-- inside a transaction; if your editor balks, run these one line at a time.)
alter type place_category add value if not exists 'cafe';
alter type place_category add value if not exists 'bar';
alter type place_category add value if not exists 'museum';
alter type place_category add value if not exists 'outdoors';
alter type place_category add value if not exists 'shopping';
alter type place_category add value if not exists 'pharmacy';
alter type place_category add value if not exists 'hospital';
alter type place_category add value if not exists 'police';
alter type place_category add value if not exists 'other';

-- Free-text label shown when category = 'other' (e.g. "viewpoint", "laundromat").
alter table places add column if not exists category_other text;
