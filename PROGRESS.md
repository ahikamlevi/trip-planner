# Trip Planner — Project Handoff / Progress

A collaborative day-by-day trip planner for two people (owner + partner). Built
public-ready but scoped for two private users now. **Live and in real use.**

This document is the single source of truth for picking up work in a new session.
See also: `LAUNCH-ROADMAP.md` (forward-looking public-launch plan + open items),
`trip-planner-plan.md` (original build plan), `SETUP.md`, `DEPLOY.md`, `SMTP-SETUP.md`.

---

## 1. Current status — DONE

Core v1 (Stages 1–6) **plus** a large set of polish/extra features are complete,
deployed, and verified in production. Both users can log in and edit a shared trip
live.

- **Live URL:** https://trip-planner-pearl-eight.vercel.app
- **GitHub:** `ahikamlevi/trip-planner` (branch `main`)
- **Hosting:** Vercel (frontend, auto-deploys on push to `main`) + Supabase
  (Postgres/Auth/Realtime + the `discover` Edge Function).
- Both accounts (owner + partner) confirmed working and sharing.
- **Migrations through `0019`** must be run in Supabase; the **`discover` Edge
  Function** must be deployed with `FOURSQUARE_API_KEY` set (see §4.1) — otherwise
  discovery silently falls back to free Overpass/OSM.
- Now being built toward a **public, polished product** (not just 2 users) — see
  `LAUNCH-ROADMAP.md`. Earlier work: Daylight-Teal theming, landing page, Foursquare
  discovery, dietary/allergy card, stop reminders + calendar export, editable travel
  legs, per-place colors, and many mobile/UX fixes.
- **Recent session work (this is the newest layer):**
  - **Map & Places layout**: the map is no longer a big full-width panel on top — it's now
    **side by side** with the lists (sticky map on the right, ~380px) like the itinerary,
    with a **"⤢ Bigger map"** toggle to grow it. Stacks (map on top) under 820px. Added
    `invalidateSize()` to the `MapRenderer` + a `ResizeObserver` in `MapView` so tiles
    re-render on resize.
  - **Print / export itinerary**: "🖨️ Print / PDF" button → a clean, hidden, linear
    `PrintItinerary` doc revealed by `@media print` (same pattern as the allergy card) →
    browser print dialog → Save as PDF. Per-day date/area/weather/note + stops + travel
    legs, then appended **trip notes**, **budget summary** (total + by-category) and
    **packing list** sections; costs in trip currency. **Include/exclude toggles**
    (Notes/Budget/Packing/Day-costs checkboxes by the Print button) control the output,
    a **per-day cost** line can show in each day heading, and the appended sections start
    on a **fresh page** (`break-before`). ItineraryBoard takes `tripName`/`currency`/
    `notes` props and load() also pulls budget_entries + packing_items (best-effort;
    print-only, never blocks the board).
  - Place list: click a row = select + focus map; ✏️ **Edit** button opens the editor
    (no more modal covering the map on every tap).
  - **Expanded place categories** + free-text "Other" (`0015`).
  - **⚙️ gear menus** — trip Edit/Delete + account (Change password / Sign out).
  - **Member email** shown in the roster (`0016`); **trip-owner-check** RLS (`0017`).
  - **Discovery overhaul:** search stays on Foursquare's free **Pro tier** (no rating);
    premium details fetched **only on an explicit "ℹ️ Details" tap** (cached); "+ Add"
    folds rating/price/phone/website/description into the place **notes**. Sticky map is
    an opaque panel; results + wishlist are capped scroll boxes. **XSS fix** (escaped
    map tooltips) + edge-function error-leak fix.
  - **Per-leg travel cost** (`0018`) → counts in the Budget under Transport.
  - **Per-user rate limiter** for `discover` (`0019`) — 60 searches/hr, 100 details/day.
  - **Per-day weather** (Open-Meteo, keyless): forecast (~16d) + **climate normal**
    ("typical for this time of year") for planning further out.
  - **Toast system** (`src/components/Toast.tsx`) adopted across all panels — save
    confirmations, friendly errors, Packing **Undo**.
  - **Sentry** error monitoring (opt-in via `VITE_SENTRY_DSN`, errors-only).
  - **Stadia Maps** for **tiles** (`osm_bright`) + **geocoding** (search/reverse,
    Pelias autocomplete) when `VITE_STADIA_API_KEY` is set; OSM/Nominatim fallback.
  - **Stadia Maps routing** (Valhalla) for travel times + road-shaped paths when the key
    is set (`src/routing/stadia.ts`), OSRM kept as the keyless fallback — so tiles,
    geocoding, AND routing now all run on Stadia in production.
  - **Import a place from a Maps link**: a "📍 Add from link" box in the Places tab
    parses pasted Google/Apple Maps URLs, `geo:` URIs, and raw `lat,lng`
    (`src/places/mapsLink.ts`) → drops a pin + opens the editor prefilled. **Short
    `maps.app.goo.gl` / `goo.gl/maps` links** are expanded by a new keyless
    **`resolve-place` Edge Function** (`supabase/functions/resolve-place/`) — follows the
    redirect server-side (SSRF-allowlisted to Google/Apple hosts, hop-capped), parses
    coords+name, JWT-verified + per-user rate-limited (`resolve` bucket, reuses
    `consume_rate_limit`). ⚠️ **Must be deployed** (see §4.2) — until then short links
    fail gracefully with a "paste the full URL" hint.

### ⚠️ Operational state / pending for production (read this on a fresh start)
- **Migrations `0015`–`0019` are applied** in Supabase, and the **`discover` Edge
  Function is redeployed** (current `index.ts`: Pro-tier search, on-demand details,
  per-user rate limiting, generic error bodies — no `_raw`).
- **⚠️ The new `resolve-place` Edge Function is NOT yet deployed.** Its code is in the
  repo (`supabase/functions/resolve-place/index.ts`) but must be deployed for short
  Maps links to expand (see §4.2). No migration/secret needed. Until deployed, pasting a
  full Maps URL / coords works; a short `maps.app.goo.gl` link shows a graceful hint.
- **`VITE_STADIA_API_KEY` is set in Vercel** (and locally), so Stadia tiles + geocoding
  **+ routing** are live in production. **`VITE_SENTRY_DSN`** is in the **local `.env`
  only** (git-ignored) — Sentry is live locally but **NOT yet set in Vercel**, so
  **production has no Sentry.** To finish: add `VITE_SENTRY_DSN` in **Vercel → Settings →
  Environment Variables** and redeploy.
- **Routing** (travel times) now uses **Stadia Maps (Valhalla)** when the key is set
  (multi-mode), behind the `RouteProvider` adapter; **OSRM stays as the keyless
  fallback** (`src/routing/stadia.ts`, picked in `src/routing/index.ts`).

---

## 2. Tech stack

- **Frontend:** React 18 + TypeScript + Vite. Plain CSS in `src/index.css` (no
  Tailwind/UI lib). Routing via `react-router-dom`.
- **Backend:** Supabase — Postgres, Auth, Row Level Security, Realtime.
- **Map:** Leaflet behind a swappable `MapRenderer` adapter (`src/map/`). **Tiles**
  (`src/map/tiles.ts`): **Stadia Maps** `osm_bright` (always the bright classic style)
  when `VITE_STADIA_API_KEY` is set, else free public **OpenStreetMap** tiles.
  **Geocoding** (place search + reverse-geocode city, `src/places/search.ts`):
  **Stadia** Pelias autocomplete when the key is set, else OSM **Nominatim** fallback.
- **Routing/travel time:** **Stadia Maps** (Valhalla `route` endpoint) when
  `VITE_STADIA_API_KEY` is set, else the keyless **OSRM** public demo server — behind a
  swappable `RouteProvider` adapter (`src/routing/`), results cached in `route_cache`.
  Distance/time legs + full road-shaped path (decoded from Valhalla's precision-6
  polyline).
- **Place discovery:** behind a swappable `DiscoveryProvider` adapter
  (`src/discovery/`). Primary = **Foursquare** via the `discover` Supabase **Edge
  Function** (key server-side; ratings/price/hours); **falls back to Overpass**
  (keyless OSM) if the function errors / isn't deployed. Category + free-text picker;
  search returns cheap fields, premium fields fetched on demand; cached in
  `poi_cache`. See **§4.1** for the operational details.
- **Drag & drop:** `@dnd-kit` (core, sortable, utilities).
- **i18n:** custom lightweight solution in `src/i18n/` (English + Hebrew, RTL).
- **Backend code:** one Supabase **Edge Function** (`supabase/functions/discover/`,
  Deno/TypeScript) for Foursquare discovery. Everything else is client + Supabase SQL.

---

## 3. How to run locally

```
npm install
npm run dev          # http://localhost:5173 (port pinned, strictPort)
npm run build        # tsc -b && vite build
npm run typecheck    # tsc -b --noEmit
```

Requires a `.env` (git-ignored) at repo root:
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
VITE_SENTRY_DSN=<optional — enables Sentry error monitoring; leave blank to disable>
VITE_STADIA_API_KEY=<optional — map tiles from Stadia Maps; blank = free public OSM tiles>
```
Supabase values come from Supabase → Project Settings → API. Never commit the
service_role key. `VITE_SENTRY_DSN` is optional (Sentry stays off if unset); add it in
Vercel → Project → Settings → Environment Variables to enable it in production.

---

## 4. Database — migrations (run in order in Supabase SQL editor)

All live in `supabase/migrations/`. For a fresh Supabase project, run them in order.
They are mostly idempotent.

| File | Adds |
| --- | --- |
| `0001_init.sql` | All tables + RLS + triggers (`handle_new_user`, `handle_new_trip`) + helpers (`is_trip_member`, `is_day_member`) |
| `0002_sharing.sql` | `shares_trip_with`, cross-member profile read, FK `trip_members.user_id → profiles`, `invite_member_by_email(_trip_id,_email)` RPC |
| `0003_stop_cost.sql` | `stops.cost` |
| `0004_route_cache_policies.sql` | client insert/update policies on `route_cache` |
| `0005_trip_currency.sql` | `trips.currency` (default 'USD') |
| `0006_day_notes.sql` | `days.note` |
| `0007_realtime.sql` | adds tables to `supabase_realtime` publication (live sync) |
| `0008_notes_packing.sql` | `trips.notes` + `packing_items` table + RLS + realtime |
| `0009_dietary.sql` | `profiles.dietary_restrictions` (text[]) + `profiles.dietary_note` + `places.dietary_notes` |
| `0010_trip_cover.sql` | `trips.cover_emoji` (optional cover emoji shown on dashboard + trip header) |
| `0011_place_color_city.sql` | `places.color` (per-place color label) + `places.city` (auto-captured, editable; used for filtering) |
| `0012_stop_reminder.sql` | `stops.reminder_min` (minutes before arrival; becomes a calendar .ics alarm) |
| `0013_stop_travel.sql` | `stops.travel_mode/_min/_dist_m/_note` (editable travel-leg overrides into each stop) |
| `0014_poi_cache.sql` | `poi_cache` table (server-side discovery cache; written/read only by the `discover` Edge Function via service role) |
| `0015_place_categories.sql` | expands `place_category` enum (cafe, bar, museum, outdoors, shopping, pharmacy, hospital, police, **other**) + `places.category_other` (free-text label shown when category=`other`) |
| `0016_profile_email.sql` | `profiles.email` (mirrored from `auth.users` via the signup trigger + an email-change trigger; backfilled) so the members list can identify invitees by email when they have no display name |
| `0017_trip_owner_check.sql` | adds `WITH CHECK (owner_id = auth.uid())` to the `trips` UPDATE policy so an owner can't reassign `owner_id` and orphan the trip (security hardening) |
| `0018_stop_travel_cost.sql` | `stops.travel_cost` (price of the travel leg into a stop; edited in the leg editor, counted in the budget under Transport) |
| `0019_rate_limit.sql` | `api_rate_limit` table + `consume_rate_limit(_user,_bucket,_limit,_window_seconds)` SECURITY DEFINER fn (fixed-window per-user limiter for the `discover` function; client EXECUTE revoked; self-pruning, no pg_cron) |

**Data model (tables):**
- `profiles` (id→auth.users, display_name, email[mirrored from auth.users], dietary_restrictions[], dietary_note)
- `trips` (name, country, start_date, end_date, owner_id, currency, notes, cover_emoji)
- `trip_members` (trip_id, user_id, role: owner|editor)
- `areas` (trip_id, name, sort_order)
- `days` (trip_id, date, area_id, note)
- `places` (trip_id, name, lat, lng, category[food|cafe|bar|sight|museum|outdoors|beach|hotel|shopping|transport|pharmacy|hospital|police|other], category_other[free-text label when category=other], google_place_id, notes, opening_hours, dietary_notes, color, city, est_cost, scheduled[UNUSED now])
- `stops` (day_id, place_id, sort_order, arrival_time, duration_min, cost, reminder_min, travel_mode, travel_min, travel_dist_m, travel_note, travel_cost)
- `route_cache` (origin, dest, mode, distance, duration, fetched_at)
- `budget_entries` (trip_id, area_id?, day_id?, category, amount, currency, note)
- `packing_items` (trip_id, label, packed, sort_order)
- `poi_cache` (cache_key, results jsonb, fetched_at) — discovery cache, Edge-Function only

**RLS model:** every row is reachable only by members of its trip
(`is_trip_member` / `is_day_member`). `route_cache` is readable/writable by any
authenticated user (cache only). `poi_cache` has RLS on with **no policies** (clients
blocked; only the Edge Function via the service role touches it). Types hand-authored
in `src/lib/database.types.ts` (regenerate via `supabase gen types` if desired).

---

## 4.1 Edge Function — `discover` (Foursquare discovery) ⚠️ deploy steps

Location: `supabase/functions/discover/index.ts` (Deno/TypeScript). Called from the
client via `supabase.functions.invoke('discover', { body })` — JWT-verified, so only
signed-in users can reach it. Two modes:
- **Search:** `{ bounds, query, limit }` → Foursquare `places/search`, **core/Pro
  fields only** (id/name/coords/categories/location — NO rating), normalized →
  `{ results }`. Result of one search cached in `poi_cache` (key = query + viewport
  snapped to ~1 km + cap, 7-day TTL).
- **Details:** `{ placeId }` → Foursquare `places/{id}` for the **premium fields**
  (rating/hours/price/website/phone/description). Cached per place id. The client only
  calls this on an **explicit "ℹ️ Details" tap** or when a place is added
  (`fetchPlaceDetails`) → controls cost. (Each details call is a Premium-tier charge
  even if the place returns nothing, but the 7-day cache means one charge per place.)

**To deploy / change it (do this when `index.ts` changes):**
- Dashboard: Edge Functions → `discover` → paste the file's contents → **Deploy**.
  (Or CLI: `supabase functions deploy discover`.)
- Secret: `FOURSQUARE_API_KEY` = a Foursquare **Service API Key** (NOT the Client
  Secret), unrestricted, set under Project Settings → Edge Functions → Secrets.
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected.
- **After changing the function or the secret, you must redeploy.** If discovery shows
  only OSM-style results, the function errored and fell back to Overpass — check
  Edge Functions → `discover` → Logs (`Foursquare 401` = wrong key, `429` = no credits/
  premium-field cost, `FOURSQUARE_API_KEY is not set` = secret missing).
- **Cost:** Foursquare bills **per API call, by tier** — a call requesting ANY premium
  field (rating/hours/price/photos/tips) is billed at the Premium rate with no free
  allowance; a call with only core/Pro fields stays in the free/cheaper Pro tier
  (10k free calls + $200 credit, then ~$15/1k vs ~$18.75/1k Premium). That's why the
  bulk search requests core fields only (no rating) and premium details are on-demand
  per place + cached. Billing must be enabled on the Foursquare org for any calls to
  succeed (free credits require a card on file).
- **Per-user rate limiting (migration `0019`):** before each *billed* (cache-miss) call
  the function calls `consume_rate_limit` keyed by the caller's JWT `sub` — **`search`
  60/hour, `details` 100/day per user** (constants in `index.ts` `LIMITS`) — and returns
  **429** when exceeded so one user/bot can't drain the shared credits. Cache hits don't
  count. **Fails open** (allows) if the user id / service client / migration is missing,
  so a hiccup never breaks discovery; the FSQ billing cap is the hard backstop. Client
  degrades gracefully: a 429 on search falls back to Overpass, on details the "Details"
  button stays retryable.

---

## 4.2 Edge Function — `resolve-place` (expand short Maps links) ⚠️ deploy steps

Location: `supabase/functions/resolve-place/index.ts` (Deno/TypeScript). Powers the
"📍 Add from link" box's short-link case: the client posts `{ url }` for a
`maps.app.goo.gl` / `goo.gl/maps` link (which carries no coordinates and is an opaque
cross-origin redirect the browser can't follow), and the function follows the redirect
**server-side** and returns `{ lat, lng, name }`. Full/long URLs, `geo:`, and raw
`lat,lng` are parsed client-side (`src/places/mapsLink.ts`) and never hit this function.

- **Keyless** — no third-party API, no secret. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
  are auto-injected and used only for the rate limiter. **No new migration** (reuses
  `consume_rate_limit` from `0019` with a new `resolve` bucket).
- **To deploy:** Dashboard → Edge Functions → **Create function** `resolve-place` → paste
  `index.ts` → **Deploy** (or CLI: `supabase functions deploy resolve-place`). JWT-verified
  by default, so only signed-in users can call it.
- **Security (SSRF):** it fetches a client-supplied URL, so it's locked down — an
  **allowlist** of Google/Apple map hosts is checked on the start URL *and every redirect
  hop* (`isAllowedHost`), redirects are followed manually with a **hop cap** (6), and the
  fetched body is **never returned** to the client (only parsed lat/lng/name). It reads
  the `Location` header per hop; if the terminal page is HTML it scans `canonical`/`og:url`
  + raw `!3d!4d`/`@lat,lng` as a fallback.
- **Rate limit:** `resolve` bucket, **60/hour per user**, **fails open** (it's free, the
  limit is just abuse protection). Returns 429 when exceeded.
- **Client degradation:** any failure (not deployed, 422 no-coords, 429) shows a friendly
  "paste the full Maps URL or the coordinates" hint — the full-URL/coords paths still work.
- ⚠️ **Not yet deployed** — see the operational note in §1. Verify after deploy with a real
  `maps.app.goo.gl` link (the redirect-follow path can't be exercised without one).

---

## 5. Auth model (private, two users)

- **Methods:** magic link **and** email+password (both on the login screen).
- **Sign-ups are DISABLED** in Supabase. Accounts are created by hand
  (Authentication → Users → Add user). This keeps the app private to the two of us.
- In-app **set/change password** (header "Password" button), **forgot password**
  link, and a **password-recovery screen** (handles Supabase `PASSWORD_RECOVERY`).
- **Email delivery:** Resend custom SMTP (the built-in Supabase sender is rate-
  limited). NOTE: Resend's *test sender* (`onboarding@resend.dev`) only delivers to
  the owner's own Resend signup email — that's why the partner uses **password
  login** (no email needed). To email anyone, verify a domain in Resend.
- **Supabase URL config** must include both `http://localhost:5173/**` and the
  Vercel URL in Site URL + Redirect URLs, or magic links/redirects fail.

---

## 6. Features implemented

- **Stage 1 — Foundation:** auth, trips dashboard.
- **Stage 2 — Trips & sharing:** create/edit/delete trips; invite by email
  (`invite_member_by_email` RPC, since RLS blocks client-side user lookup);
  dashboard split into owned vs. shared with role badges; editable display name.
- **Stage 3 — Places & map:** `MapRenderer` adapter + Leaflet; Nominatim search;
  add via search or "Drop a pin" toggle (map clicks only add a place in drop mode);
  categories (food/attraction/beach/hotel/transport); place editor
  (name/category/notes/cost/hours); map pin popups; click a place row → centers map.
- **Stage 4 — Itinerary (CALENDAR):** Day/Week/Month views with prev/next nav and a
  Trip-start/Today reset. Drag from the reusable **Places palette** onto days,
  reorder within a day, move between days, drag back to palette to unschedule.
  Dropping on a date auto-creates the day row. Optional arrival time + duration +
  **per-stop cost**. Reusable places (a place can be on many days; `×N` badge).
  Light **areas** (create + assign to a day). **Day notes**.
- **Stage 5 — Routes & travel time:** `RouteProvider` adapter + OSRM; 🚗 distance·time
  connectors between consecutive located stops; per-day travel total; gentle
  "⚠ busy" flag; **road-shaped** route line on the Day map (real OSRM geometry,
  session-cached); straight-line fallback while loading.
- **Stage 6 — Budget, notes & Today:** Budget tab (total = per-stop costs + per-leg
  travel costs + manual entries; By-category and By-day rollups; add/delete "other
  costs"); single trip
  **currency** (Intl-formatted); **trip-level notes** (owner-editable); notes
  surfaced on stop cards + palette; **Today-aware** (auto-opens to Itinerary→Day on
  today when traveling; today highlighted everywhere).
- **Extras / polish:**
  - **Live realtime sync** (`useTripRealtime`): Supabase Realtime → debounced reload
    on any trip-table change. Edits appear for both users without refresh.
  - **Shared packing checklist** (Packing tab, live-synced).
  - **Place discovery** (Map & places tab): "Find nearby" bar with a **category
    picker** (Food · Cafés · Bars · Attractions · Museums · Outdoors · Beaches ·
    Hotels · Shopping · Pharmacy · Hospital · Police · **🔎 free-text**). **Food**
    additionally shows **diet chips** (vegan/veg/gluten-free/kosher/halal) + a
    "Match my restrictions" button; **Other** reveals a free-text box (type anything
    — viewpoint, ATM…). "Search this area" queries the current map viewport.
    Suggestions persist per trip (sessionStorage); clicking a result zooms in (never
    out) and highlights its pin.
    Primary provider = **Foursquare** (Edge Function), falling back to **Overpass**.
    **Cost control:** the bulk search asks only for **core/Pro fields** (no rating,
    capped at 25 results) so it stays on Foursquare's free/cheap Pro tier. Premium
    fields (**rating**/hours/price/website/phone/description) are fetched **only on
    explicit request** — a per-card **"ℹ️ Details"** button → one cached Place Details
    call (`fetchPlaceDetails`), with **Loading** / **"No extra details"** states and
    retry-on-failure (a place is marked enriched only on success). Tapping a result now
    just shows it on the map (free); details are never auto-fetched. Both search and
    details are cached in `poi_cache`.
    Suggestions are **green pins** + cards; "+ Add" drops one into the wishlist with
    the matching category, its **city**, and **opening hours** filled in — and since
    the `places` table has no rating/price/phone/website columns, those premium fields
    are **folded into the place's `notes`** (★rating · $price / ☎phone / 🔗website /
    description) so the paid-for data isn't lost. Card also shows a Google **Maps ↗**
    link. The top box stays "search a place by name" (Nominatim) — distinct from
    discovery. Map adapter has `getBounds()` + per-marker `color`; `MapView` exposes
    `MapApi`.
    **Layout (`.places-layout`):** map + lists sit **side by side** like the itinerary
    day view — discovery results + wishlist on the left (each a **capped internal-scroll
    box**), the **sticky map on the right** (default 380px, a **"⤢ Bigger map" toggle**
    grows it to ~78vh). Stacks to one column under 820px with the map on top (so tapping
    a place still shows it on a visible map — key on mobile). The map keeps an opaque bg +
    bottom shadow for the stacked case. `MapView` runs a `ResizeObserver` → renderer
    `invalidateSize()` so the map re-renders cleanly on resize/expand/reflow.
  - **Place list interaction:** clicking a wishlist row **selects it + focuses the
    map** (no longer opens the editor); a dedicated **✏️ Edit** button per row opens
    the editor — so on mobile the editor modal no longer covers the map on every tap.
    Adding via drop-a-pin still opens the editor to name the new place.
  - **Dietary & allergies** (Dietary tab): each member sets their own restrictions
    (tag chips + free note) on their `profiles` row; other members' restrictions
    show read-only (live-synced). Generates a **printable allergy card** whose
    language is independent of the UI (defaults to the *other* app language so you
    can hand locals a card they read). Food places gain a `dietary_notes` field.
  - **Mobile pass:** responsive layout; touch drag uses press-and-hold
    (MouseSensor + TouchSensor) so swipes still scroll.
  - **Day view layout:** stops + map **side by side** with a **sticky** map; trip
    page widened; stacks on mobile.
  - **Accessibility foundation:** focus-visible rings, reduced-motion, skip link,
    `<main>`/`<nav>` landmarks, aria-labels on icon buttons, keyboard-operable month
    cells + stop names, dnd-kit screen-reader announcements, AA contrast.
  - **RTL + bilingual i18n (English + Hebrew):** central dictionary
    `src/i18n/strings.ts`, `I18nProvider`/`useT()`, header language switcher,
    persists choice, flips `dir`/`lang` (he=rtl, en=ltr), default Hebrew. Dates and
    currency are locale-aware via `Intl`.
  - **Itinerary places palette**: when there are >6 places, a search box + category
    filter chips appear and the list scrolls (max-height) so a long palette doesn't
    stretch the page.
  - **Editable travel legs**: click the connector between two stops to set transport
    mode (walk/car/train/bus/bike/other), override the auto time/distance, add a
    per-leg note, and set a **per-leg cost** (`stops.travel_cost`, migration `0018`).
    Overrides win over OSRM and feed the day travel total + "too tight" warning; the
    cost shows on the connector (💰) and **rolls into the Budget** (counted like a
    per-stop cost, bucketed under **Transport** in the by-category view). Also a
    tap-to-add "+ Add a place" button per day (mobile-friendly add without dragging).
  - **Per-day weather** (Open-Meteo, **keyless**, no migration): each itinerary day
    panel + month cell shows a high/low + weather-emoji. **Two modes, auto-picked per
    date:** a real **forecast** for the next ~16 days (forecast API), and a **climate
    normal** — "typical for this time of year", averaged from the **last 10 years** of
    history (archive API) — for anything further out (or past), so planning months
    ahead still gets guidance. Normals render with a `≈` + italic + "typical (10-yr
    avg)" tooltip so they're never mistaken for a forecast. Location is the day's first
    located stop (falling back to the trip's first place) → right city per day; grouped
    by location + cached, best-effort. `src/weather/openMeteo.ts` (`useTripWeather`).
  - **Stop reminders + calendar export**: each timed stop has a "remind me N before"
    selector (`stops.reminder_min`); an "📅 Add to calendar" button in the itinerary
    toolbar downloads an `.ics` of all timed stops, with a `VALARM` for ones that have
    a reminder set, so the phone's calendar delivers the alert (offline, app closed).
    Builder in `src/itinerary/ics.ts`. True web push is parked for a later phase.
  - **Per-place color labels** (Google-Calendar style): preset palette in the place
    editor, overriding the category color; applied to map pins, wishlist rows,
    palette cards, and itinerary stop cards (falls back to category color).
  - **Place city + filtering**: city auto-captured on add (Nominatim search address /
    reverse-geocode for dropped pins) and user-editable; wishlist filters by category
    and city.
  - **Mobile drag fix**: palette/stop cards used `touch-action: none`, which blocked
    scrolling and cancelled hold-to-drag on touch → changed to `pan-y`.
  - **Theming** ("Daylight Teal"): light (default) + refined dark, system-aware, with
    a header toggle persisted in localStorage. All colors are CSS tokens in `:root` /
    `:root[data-theme="dark"]`; `ThemeProvider` (`src/theme/`) sets `data-theme` on
    `<html>`. The print allergy card stays white/dark on purpose.
  - **Toasts** (`src/components/Toast.tsx`, `ToastProvider`/`useToast`): app-wide
    notifications mounted at the root. Confirm instant-saves ("Saved", "Added X",
    "Removed X"), surface **friendly localized errors** (replacing raw RLS/Postgres
    strings on the write paths), and support an **action button** for **Undo**.
    **Adopted across all panels** — Places, Packing (with re-insert **Undo**), Budget,
    Dietary, TripView (trip edit/delete, member remove, notes), and the Itinerary
    (stop edit/remove, day clear, area/note, add, drag — error-surfacing). Success/
    error/info variants, auto-dismiss, reduced-motion aware, RTL via logical props.
  - **Error boundary** (shows the error instead of a blank page; also reports the
    caught error to Sentry).
  - **Error monitoring (Sentry)** (`src/lib/sentry.ts`, `@sentry/react`): initialized
    in `main.tsx` **only when `VITE_SENTRY_DSN` is set** (opt-in via env — the app runs
    fine without it). Captures uncaught errors + unhandled promise rejections (global
    handlers) and render errors (via the ErrorBoundary, through `captureException`).
    **Errors only** — no performance tracing or session replay (the heavy parts), so
    the static import tree-shakes small (~29 kB gzip). Source-map upload + Edge-Function
    instrumentation are later add-ons.
  - **Destructive-delete confirmations** (place, member, budget entry, trip,
    clear-day). Stop-remove and packing-uncheck stay instant (easily reversible).
  - **Gear/settings dropdown** (`src/components/Menu.tsx`, reusable, outside-click +
    Esc to close): the trip **Edit / Delete** actions live behind a ⚙️ on the trip
    header (Delete is no longer one exposed click), and the header **Change password /
    Sign out** live behind a ⚙️ account menu.

---

## 7. Key product/architecture decisions (don't undo without reason)

1. **Instant-save + live-sync** model. Every edit persists immediately and syncs to
   the other user. We deliberately did **NOT** add a global Save/Discard button —
   it would break realtime collaboration. Safety is via per-action confirmations on
   destructive deletes only.
2. **Per-stop cost** (not per-place). A restaurant keeps a cost on each visit
   (counts every time); a hotel you return to gets its cost cleared on repeat nights
   (counts once). `places.scheduled` is now unused (left in DB, harmless).
3. **Reusable places palette** — a place is never "consumed"; drag it onto many days.
4. **Calendar itinerary** replaced the original horizontal day-columns.
5. **Adapters** for map (`src/map/index.ts`) and routing (`src/routing/index.ts`):
   swap one line to change provider. Billable providers (Google/Mapbox) would move
   behind a Supabase Edge Function so the key stays server-side.
6. **Private auth:** magic link + password, sign-ups disabled, manual accounts.
7. **Hebrew default + bilingual switcher;** all strings in `src/i18n/strings.ts`.

---

## 8. Repo structure (src/)

```
App.tsx                      route gating (login / recovery / routes) + skip link
main.tsx                     providers: ErrorBoundary > I18n > Router > Auth > App
index.css                    all styles (logical props for RTL; mobile @media at bottom)
vite-env.d.ts

auth/        AuthProvider.tsx (session + passwordRecovery), Login.tsx, SetPassword.tsx
components/  AppHeader.tsx (name/lang/theme + ⚙️ account menu), ErrorBoundary.tsx,
             Menu.tsx (reusable ⚙️ dropdown), EmojiPicker.tsx,
             Toast.tsx (ToastProvider + useToast — app-wide notifications/Undo)
i18n/        strings.ts (EN+HE dict), I18nProvider.tsx (useT), LanguageSwitcher.tsx
theme/       ThemeProvider.tsx (useTheme; light/dark, sets data-theme on <html>)
lib/         supabase.ts, database.types.ts (hand-authored), useTripRealtime.ts, sentry.ts
map/         MapRenderer.ts (interface), MapView.tsx (React wrapper), index.ts (active
             provider), tiles.ts (Stadia/OSM tile config), leaflet/LeafletRenderer.ts
places/      PlacesWorkspace.tsx (map tab; search=preview-only, editor-as-modal,
             PasteMapsLink box), categories.ts (incl. PLACE_COLORS + placeColor),
             search.ts (Stadia/Nominatim search + reverseCity), mapsLink.ts
             (parseMapsLink — pure URL/coords parser), dietary.ts (tags)
discovery/   DiscoveryProvider.ts (interface + DiscoCategory/PlaceDetails), categories.ts
             (DISCO_CATEGORIES), foursquare.ts (Edge-Function client + fetchPlaceDetails),
             overpass.ts (fallback), index.ts (active provider = FSQ→Overpass)
itinerary/   ItineraryBoard.tsx (calendar + dnd, BIG file), dates.ts (Intl-based), ics.ts (calendar export)
routing/     RouteProvider.ts (interface), stadia.ts (Valhalla), osrm.ts (fallback),
             index.ts (provider pick + getRouteCached, getRoutePathCached)
budget/      BudgetPanel.tsx, money.ts (Intl currency)
packing/     PackingPanel.tsx
dietary/     DietaryPanel.tsx (self-editor + members overview + printable allergy card)
routes/      Dashboard.tsx, TripView.tsx (tabs: places/itinerary/budget/packing/dietary + members + notes)
weather/     openMeteo.ts (keyless per-day forecast; useTripWeather + weatherMeta)

supabase/functions/discover/index.ts        Deno Edge Function (Foursquare) — see §4.1
supabase/functions/resolve-place/index.ts    Deno Edge Function (expand short Maps links) — see §4.2
```

---

## 9. Known caveats / gotchas

- **Vercel auto-deploy occasionally misses a push** (free tier). If the deployed
  commit lags `main`, push an empty commit (`git commit --allow-empty`) or use
  Vercel → Deployments → ⋯ → Redeploy.
- **OSRM public demo** = driving profile only, light use. **Nominatim** = light use.
  Both fine for two people; for a public launch move behind Edge Functions w/ caching.
- **Day-map road geometry** is cached in-memory per session only (not in `route_cache`,
  which is per origin-dest pair).
- **Discovery / Foursquare:** changing `supabase/functions/discover/index.ts` requires
  a **redeploy** to take effect (§4.1). Costs money — billing is **per call by tier**, so
  any premium field (rating/hours/price) on a call makes it Premium-billed; keep the bulk
  search to core fields only and premium details on-demand per place (see §4.1). Overpass public servers are the free
  fallback but rate-limit/timeout (we fail over across 3 mirrors). The discovery cache
  key snaps the viewport to ~1 km, so very different zoom/pan misses the cache; results
  also **persist per trip in sessionStorage** so tab switches don't lose them.
- **Bundle size warning** on build (Leaflet + dnd-kit + supabase, now ~680kB) —
  advisory only; code-splitting is a future option.
- **Line endings:** git warns LF→CRLF on Windows; harmless.
- **Translations** are functional but subjective — Hebrew wording can be tweaked
  per key in `src/i18n/strings.ts`.

---

## 10. Open items / future plans

`LAUNCH-ROADMAP.md` has the full, phased public-launch program. Quick list of what's
**still open** (everything in §6 is done):

**Phase 0 polish — remaining:**
- ~~Per-day weather~~ — DONE (Open-Meteo, keyless; high/low + emoji on day panels &
  month cells, per-day location. **Forecast** within ~16 days + **climate normal**
  ("typical this time of year", 10-yr archive avg) for planning further out; `src/weather/`).
- ~~Print/export a clean itinerary~~ — DONE: "🖨️ Print / PDF" button in the itinerary
  toolbar reveals a hidden linear read-only doc (`PrintItinerary` in `ItineraryBoard.tsx`)
  via `@media print` (same reveal pattern as the allergy card) → browser print → Save as
  PDF. Per day: date/area/weather/note + stops (time/name/duration/cost/notes/dietary) +
  travel legs; then trip notes, budget summary + packing list sections; costs in trip
  currency.
- **"Deleted · Undo" toasts** (we use confirmations now; true undo is non-trivial with
  instant-save + realtime — likely a deferred-delete toast).
- **Place photos** / image uploads + trip cover *image* (needs Supabase Storage).

**Discovery follow-ups:**
- ~~Real **Service/Health place categories** (enum migration)~~ — DONE in `0015`:
  the place editor now offers the full category set (cafe/bar/museum/outdoors/shopping/
  pharmacy/hospital/police) + a free-text **Other** category (`places.category_other`).
  Discovery still maps Foursquare/OSM results into the closest of these on add.
- **Hebrew result localization** for Foursquare (`Accept-Language` header). Category
  chips already work in any language; free-text needs English or a real place name.
- **"Scheduled outside opening hours" warning** on a stop (places now carry
  `opening_hours`; pairs with the existing time-order/too-tight warnings).
- **Zoom/pan-tolerant discovery cache** (key on map center + radius bucket).

**Reminders / calendar:**
- **Subscribe-URL calendar feed** (Edge Function serving a live `.ics` the phone
  subscribes to) — instead of the current one-time download. Then **true web push**
  (PWA + service worker + Supabase scheduler/pg_cron + VAPID; iOS needs installed PWA).

**Documents:** insurance / tickets / passport-photos tab — needs Supabase Storage
(deferred; passports are sensitive PII).

**Public-launch hardening (Phase 1+):** proxy Nominatim/OSRM behind Edge Functions w/
caching + per-user rate limiting + error monitoring (Foursquare already done); enable
public sign-ups + onboarding + a **viewer** role; WCAG 2.1 AA audit; code-splitting to
shrink the ~680 kB bundle.

**Monetization (if pursued):** freemium subscription + **travel affiliate links**
(hotels/activities). Margins depend on the discovery cost control already in place.

---

## 11. Typical workflow for changes

1. Edit code → `npm run typecheck` (or `npx tsc -b`) and `npm run build` to verify.
2. If schema changed, add a numbered migration in `supabase/migrations/` AND run it
   in the Supabase SQL editor (the app won't apply it automatically). Latest = `0014`.
3. If `supabase/functions/discover/index.ts` changed, **redeploy the Edge Function**
   (Dashboard paste or `supabase functions deploy discover`) — pushing to git does NOT
   deploy it (only the Vercel frontend auto-deploys).
4. `git commit` + `git push origin main` → Vercel auto-deploys (~1 min). Hard-refresh.
5. Update this file + `LAUNCH-ROADMAP.md` status when finishing a chunk.

**Commit-message tip (Windows):** the Bash tool here is bash, not PowerShell — don't
use `-m @'...'@` (that injects a stray `@`). Use `git commit -F <file>` with a message
file, or a normal double-quoted `-m`.
