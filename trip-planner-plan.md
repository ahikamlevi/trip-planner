# Trip Planner — Build Plan

## What it is
A day-by-day trip planner two people edit together. The itinerary is the spine; the map is one view of it. Public-ready foundation, but built for two users (me + my wife) now.

## Architecture
- **Frontend:** React + TypeScript (Vite), deployed on Vercel
- **Data/backend:** Supabase — Postgres, Auth, Row Level Security, Edge Functions
- **Map + routing:** behind swappable adapter interfaces (`MapRenderer`, `RouteProvider`) — Google, Mapbox, or Leaflet/OSM slot in without touching app logic
- **Billable map/route calls:** proxied through Edge Functions with caching; API key stays server-side

## Data model
- **profiles** — user, display name
- **trips** — name, country, start/end dates, owner_id
- **trip_members** — trip_id, user_id, role (owner/editor) → powers both sharing and the dashboard
- **areas** — trip_id, name, order
- **days** — trip_id, date, area_id
- **places** — trip_id, name, lat, lng, category (food/sight/beach/hotel/transport), google_place_id, notes, opening_hours, est_cost, scheduled (bool → wishlist vs. on a day)
- **stops** — day_id, place_id, sort_order, arrival_time (nullable), duration_min (nullable)
- **route_cache** — origin, dest, mode, distance, duration, fetched_at
- **budget_entries** — trip_id, area_id (nullable), day_id (nullable), category, amount, currency, note

RLS throughout: a user only sees rows for trips where they're in `trip_members`.

## Product behavior locked in
- Stops are **order-first, time optional**
- Trip **auto-opens to Today** when today falls in the trip dates, else the full planner
- **Transport:** short hops = auto connector between stops; major legs = a transport-category stop; costs = budget entries
- **Wishlist → day drag** is the core interaction; **live shared editing** is the core feel
- **Place categories:** food, sight, beach, hotel, transport (extensible)

## Build stages

### Stage 1 — Foundation
Supabase project, schema + RLS, React/Vite skeleton, auth, deploy to Vercel.
**Ends at:** log in and see an empty trips dashboard live on the web.

### Stage 2 — Trips & sharing
Create/edit trips; invite wife; dashboard shows owned vs. invited trips with roles.
**Ends at:** a shared trip visible to both accounts.

### Stage 3 — Places & map
Build the `MapRenderer` adapter first, wire one provider behind it. Search and add places, drop/edit pins, categorize, notes, wishlist list.
**Ends at:** the core map + places loop working through the abstraction.

### Stage 4 — Itinerary
Areas, days, assign places to days as ordered stops, optional times/durations, drag to reorder within and between days, wishlist→day drag.
**Ends at:** a real day-by-day itinerary.

### Stage 5 — Routes & travel time
`RouteProvider` adapter + `route_cache`; show distance/time as connectors between consecutive stops; gentle flag for unrealistic days.
**Ends at:** routing without runaway cost.

### Stage 6 — Budget, notes & Today
Budget entries at trip/area/day level with categories and rollups; notes surfaced throughout; Today-aware itinerary view for traveling.
**Ends at:** full v1.

### Stage 7 — Public polish (PARKED — only if it proves good enough to open up)
Mobile pass, onboarding, landing page, rate limiting, autocomplete session tokens, monitoring, budget alerts.

## Setup the developer must do (Claude can't do signups)
- A Supabase project (database + auth)
- A Vercel account (deploy)
- A Google Maps (or Mapbox) API key with billing enabled and a budget alert
- Exact steps come at Stage 1.

## Cost reality
- For two people: almost certainly $0/month with caching in place.
- Watch if opened up: Places Autocomplete/Details volume — handled in Stage 7.

## Developer context
- C# (main), PHP, SQL, Vertica; solo game dev shipping on Steam, built in Unity.
- Stack is NOT required to be C# — chose React/TS + Supabase for cleanest build and lowest ops.
- Claude writes the code; developer does signups/keys and runs/deploys.

## Status
Stage 1 ✅ verified live: logged in via magic link (Resend custom SMTP) to an empty
dashboard. Schema + RLS in `supabase/migrations/0001_init.sql`.
Auth: magic link, sign-ups disabled, accounts added by hand → private to two emails.
Stage 2 code complete (typechecks + builds): routing, create/edit/delete trips,
dashboard split into owned vs. shared with role badges, editable display name,
invite-by-email via `invite_member_by_email` RPC, members list, remove member.
New migration `0002_sharing.sql` must be run in Supabase. Sharing works owner-side;
**second-user login is PARKED** until deploy + auth decision (localhost isn't
reachable by the other person; needs Vercel URL + password-or-email-delivery).
Stage 3 code complete (typechecks + builds): `MapRenderer` adapter with a Leaflet/OSM
implementation behind `src/map/index.ts` (swap one line for Google later), React
`MapView`, free Nominatim place search, add via search or map-click, colored
category pins, place list ("wishlist"), and an editor (name/category/notes/cost/hours)
with delete. No new migration — `places` table + RLS already shipped in 0001.
Stage 4 code complete (typechecks + builds): trip page now has Map&Places /
Itinerary tabs. Itinerary uses @dnd-kit — generate days from trip dates (or add/
remove), wishlist column, drag wishlist→day to create stops, reorder within a day,
move stops between days, drag back to wishlist to unschedule, optional arrival
time + duration per stop, light areas (create + assign to a day). No migration —
areas/days/stops + RLS already in 0001.
Itinerary redesigned as an Outlook-style CALENDAR: Day/Week/Month views, prev/next
nav + Trip-start/Today reset. Month = overview grid (click a date → Day view);
Week = vertical agenda of clickable day rows; Day = single detailed day. Dropping a
place on a date auto-creates the day row (Generate-days step removed).
Reusable places: left panel is now a permanent "Places" palette (×N badge) — drag a
place onto many days; each visit is its own stop. Cost is PER-STOP (migration
`0003_stop_cost.sql` adds stops.cost), pre-filled from place.est_cost, editable per
visit (restaurant = cost each time; hotel = clear cost on repeat nights). `scheduled`
flag no longer used.
Stage 5 code complete (typechecks + builds): `RouteProvider` adapter with OSRM
(keyless) behind `src/routing/index.ts`; getRouteCached() reads/writes `route_cache`
(migration `0004_route_cache_policies.sql` adds client insert/update policies).
Itinerary Day/Week panels show 🚗 distance · time connectors between consecutive
located stops, a per-day travel total, and a gentle "⚠ busy" flag (travel > 5h or
travel+visits > 12h).
Stage 6 code complete (typechecks + builds) → core v1 DONE. Budget tab: total =
itinerary stop costs + manual budget_entries, with By-category (place categories +
entry categories) and By-day rollups, add/delete "other costs", single trip currency
(migration `0005_trip_currency.sql` adds trips.currency; picker in trip edit; money
via Intl). Notes surfaced on stop cards + palette (📝). Today-aware: trip auto-opens
to Itinerary→Day on today when traveling; today highlighted in month/week/day.
Deploy + her login: added email+password sign-in (magic link kept as fallback) so the
second user logs in without email delivery. Repo git-initialized + committed (`.env`
ignored). Exact deploy steps in `DEPLOY.md` (push to GitHub → Vercel + env vars →
Supabase redirect URLs → create her account w/ password → share). Awaiting developer
to run those signups/pushes.
Polish done: in-app set/change password (recovery screen + header modal), forgot-
password link on login, favicon + page metadata.
Features added: Itinerary map view (Day view shows numbered stop markers + dashed
order path, via extended MapRenderer adapter: badge/popup/setPath); Day notes
(migration `0006_day_notes.sql` adds days.note; editable in Day view, shown in Week);
Map pin popups on Places tab (name/category/cost/hours/notes).
Live realtime sync DONE: `useTripRealtime` hook subscribes to Supabase Realtime
postgres_changes for the trip's tables and debounce-reloads; wired into TripView,
PlacesWorkspace, ItineraryBoard, BudgetPanel. Migration `0007_realtime.sql` adds the
tables to the supabase_realtime publication (idempotent). RLS still governs reads;
realtime only triggers re-fetch. Edits now appear for both users without refresh.
Stage 7 progress: mobile polish pass (responsive layout + touch press-hold drag via
MouseSensor/TouchSensor); itinerary map now draws real road-shaped routes (OSRM
geometry via RouteProvider.getRoutePath, session-cached); trip-level notes (owner-
editable, trips.notes) + shared packing checklist (`packing_items` table, member-rw,
live-synced). Migration `0008_notes_packing.sql`. Click-to-focus on Places tab already
worked (selectPlace sets map focus).
Accessibility foundation pass: keyboard focus-visible rings, prefers-reduced-motion,
skip link, <main>/<nav> landmarks + aria-current tabs, aria-labels on icon buttons,
keyboard-operable month cells + stop names, dnd-kit screen-reader announcements +
instructions, map role/label, lightened --muted for AA contrast. (Formal WCAG 2.1 AA
audit/certification deferred until UI mature / before public launch.)
RTL: document set to dir="rtl"; CSS converted to logical properties (margin/padding/
border/text-align inline); back-link arrows flipped. Hebrew TEXT translation NOT done
(English strings remain) — natural next step; switch lang="he" when translated.
PARKED: Hebrew translation, onboarding, landing page, rate limiting, budget alerts.
