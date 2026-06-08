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

- **Live URL:** https://trippio.app (custom domain on Vercel; the
  `trip-planner-pearl-eight.vercel.app` URL still works as the underlying deployment).
- **GitHub:** `ahikamlevi/trip-planner` (branch `main`)
- **Hosting:** Vercel (frontend, auto-deploys on push to `main`) + Supabase
  (Postgres/Auth/Realtime + the `discover` Edge Function).
- Both accounts (owner + partner) confirmed working and sharing.
- **All migrations through `0022` are applied** in Supabase (incl. the
  `shift_trip_days` RPC) — the trip-editor "shift all days when start date changes"
  prompt now works.
- The **`discover`** and **`resolve-place`** Edge Functions are deployed. Discovery
  uses Foursquare (Pro-tier search + on-demand premium details + per-user rate limits);
  short Maps-link expansion (`maps.app.goo.gl`) uses `resolve-place`. Both fail soft to
  the free fallback when needed (see §4.1, §4.2).
- Now being built toward a **public, polished product** (not just 2 users) — see
  `LAUNCH-ROADMAP.md`. Earlier work: Daylight-Teal theming, landing page, Foursquare
  discovery, dietary/allergy card, stop reminders + calendar export, editable travel
  legs, per-place colors, and many mobile/UX fixes.
- **Recent work — current arc** (most recent at top):
  - **Trip "Route" overview (multi-city journey)** — new default trip tab. Testers (incl.
    a Hebrew speaker) couldn't see how to express a cross-city trip like Rio → Santiago →
    Concepción → Santiago → Madrid → home — the app jumped straight into within-city
    day-planning. New **Route** tab (`src/route/RouteOverview.tsx`): an ordered list of
    destinations (cities) with the travel leg into each (✈/🚆/🚌/🚗/⛴), drawn on a map as
    the journey; add a city (geocoded via `searchPlaces`), reorder (↑/↓), edit name/dates,
    delete, and "Plan days" → Itinerary. Built on **`areas`** (migration `0025`) since
    `days.area_id` already links days to a destination. Made the **default tab** (was
    Places). Also fixed a Hebrew naming clash: the Itinerary tab was labelled **מסלול**
    ("route") — renamed to **לוח זמנים**, freeing **מסלול** for the new Route tab (likely
    part of the confusion). ⚠️ needs migration `0025`. Per-destination day filtering in the
    Itinerary is a follow-up (today "Plan days" just opens the Itinerary tab).
  - **UI redesign — Phase 1: visual foundation** (in response to user testers finding the
    app cluttered/cramped; goal = welcoming, spacious, self-explanatory; **PC first**).
    Bolder refresh of the design system in `index.css`, which re-skins every screen at
    once via the shared tokens/classes: refreshed **palette** (cleaner light ground, more
    vivid teal accent, coral highlight), new **spacing / radius / shadow scales**
    (`--space-*`, `--radius-*`, `--shadow-*`), **16 px base font + bigger heading scale +
    1.6 line-height**, bolder **buttons** (weight, radius, hover shadow, active press),
    larger **inputs** with a focus ring, **cards** with soft shadow + `--space-5` padding +
    `--radius-lg`, **segmented-pill tabs** (replaced the thin underline), bigger **chips**,
    a **sticky header**, wider `.page-body.wide` (1040→1200) and airier panel gaps.
    Verified the light + dark landing page via the preview tool (`.claude/launch.json`
    added for `preview_start`). **Still TODO (Phase 2+):** declutter the dense in-app panels
    themselves (Places/Itinerary/Budget) via progressive disclosure — fewer controls
    visible at once, move secondary actions behind menus — which is where the testers'
    "too many buttons" pain mostly lives. Mobile pass comes after PC.
  - **SEO / social tags:** `index.html` got a keyword-rich title + description, **canonical**
    (`https://trippio.app/`), `robots` meta, and **Open Graph + Twitter Card** tags so shared
    links show a real preview (title/description/image). Added `public/robots.txt`
    (allows all, disallows `/trips/`, points to the sitemap) and `public/sitemap.xml`
    (`/` + `/legal`). Public display name kept as **"Trip Planner"** (the domain is
    `trippio.app`, but that name is already taken as a product, so brand ≠ domain for now).
    **Two manual follow-ups:** (1) drop a real `public/og-image.png` (1200×630) — the OG
    tags reference it but the file isn't created yet, so previews show no image until added;
    (2) verify the site in **Google Search Console** and submit the sitemap.
  - **Code-splitting (Vercel bandwidth + load speed):** `App.tsx` now lazy-loads
    `Dashboard`/`TripView`/`Legal` via `React.lazy` + `<Suspense>`, and `vite.config.ts`
    splits `leaflet`/`@dnd-kit`/`@supabase`/`@sentry` into their own chunks. Net: the
    public **landing page no longer downloads Leaflet + dnd-kit + TripView (~134 kB gzip
    saved on first visit)** — they load only when a signed-in user opens a trip; vendor
    chunks now cache independently across deploys. The old single ~355 kB-gzip bundle and
    the >500 kB chunk-size warning are gone. (`window.location.origin` redirects + i18n
    still eager.)
  - **Publish-prep: account deletion + legal page:** (1) **Account deletion** — migration
    `0024` adds `delete_account()` (SECURITY DEFINER, `delete from auth.users where
    id = auth.uid()`; EXECUTE → `authenticated` only); FK cascades erase the user's profile,
    owned trips + content, and shared-trip memberships. UI = "🗑️ Delete account" in the ⚙️
    account menu → confirm modal (`DeleteAccountModal` in `AppHeader.tsx`) → RPC → sign out.
    (2) **Privacy Policy + Terms** — static `routes/Legal.tsx` at the public `/legal` route
    (App.tsx now renders `/legal` regardless of auth; signed-out → footer link on Landing,
    signed-in → link in the Help guide). English starter text with bracketed placeholders
    (contact email, governing law) + an allergy "not medical advice" disclaimer — **review
    before relying on it.**
  - **Email-only sign-up decision (dropped social login):** decided to launch with
    **email+password only** — the inert Google/Facebook `signInWithOAuth` buttons + divider
    were **removed** from `Login.tsx` (and the unapplied OAuth `handle_new_user` migration
    was dropped). Kept the useful piece: `Login.tsx` now **surfaces auth redirect errors** —
    an expired magic/reset/confirmation link comes back with the reason in the URL query/
    hash and no session; we read it, show it, and strip the params (previously a silent
    blank form). Public email sign-up is still gated on dashboard config (enable Supabase
    sign-ups) + **verifying a Resend sending domain** so confirmation/reset mails reach
    real users — see §5.
  - **Discovery viewport guard:** Foursquare "Search this area" now refuses a zoomed-out
    view — if the larger viewport dimension exceeds `MAX_DISCOVERY_SPAN_KM` (50 km), it
    shows `disco.zoomIn` ("zoom in to a focused area") and makes **no paid call** instead
    of querying a country-scale box (wasteful + returns a sparse capped scatter). Span via
    `boundsSpanKm` in `PlacesWorkspace.tsx`; the guard sits at the top of `runDiscovery`
    so both "Search this area" and "Match my restrictions" are covered. `disco.none` no
    longer says "zoom out" (would contradict the guard).
  - **Onboarding / guide / tips (Phase 0 launch polish):** (1) reusable **`EmptyTip`**
    (`components/EmptyTip.tsx`) — an inline "what to do here" hint shown when a tab is
    empty; wired into **Places** (no places), **Itinerary** (no stops scheduled —
    `stops.length === 0`, tip atop `.cal-area`), **Budget** (total === 0), and **Packing**
    (no items). Disappears once content exists. (2) Richer **first-trip welcome** on the
    dashboard empty state — a 4-step how-it-works list (`dash.welcomeTitle`/`step1..4`,
    `.welcome-steps`). (3) **"💡 How it works" guide modal** (`components/HelpGuide.tsx`)
    opened from the AppHeader ⚙️ account menu — 7 data-driven sections (Places/Itinerary/
    Find-nearby/Budget/Packing/Dietary/Share). `.modal` got `max-height`+scroll so the
    long guide fits. New i18n keys (`tip.*`, `help.*`, `dash.welcome*`) in en+he; other 22
    langs fall back to English.
  - **Cost-trimming pass (Stadia/Foursquare):** (1) **place search debounce raised
    400 ms → 600 ms** (`PlaceSearch` in `PlacesWorkspace.tsx`) to cut billed Stadia
    geocoding calls while keeping the as-you-type autocomplete. (We briefly tried
    fire-on-Enter-only but reverted — the autocomplete UX was better.) (2) **Discovery
    categories trimmed to
    food / hotel / pharmacy / hospital / police** (`DISCO_CATEGORIES` in
    `discovery/categories.ts`) — cafés, bars, attractions, museums, outdoors, beaches,
    shopping, and the free-text "other" search were removed to reduce paid Foursquare
    calls (the `other` free-text UI + its dead state/CSS were removed too). (3) **"⤢ Bigger map" toggle
    removed** — the Places map is a fixed 380 px (per request "the small map is enough");
    `MapView`'s `ResizeObserver`/`invalidateSize` stays (it's correctness for mobile
    stacking/orientation, not the toggle). Stadia usage was already trivially low (one
    bursty dev session ≈ 6 k credits, well within free tier) — these are pre-emptive.
  - **Allergies for non-account travelers + readable card languages** (`0023`, applied) —
    allergens were stored only on `profiles`, so a child/companion without an
    app account had nowhere to record one. New `trip_companions` table (per-trip people:
    name + allergen/diet tags + note, any member can add/edit/remove) → an "Other
    travelers" section in the Dietary tab, **merged with account members on the printable
    allergy card**. Also: the card's language picker now labels each option in the user's
    own UI language via `Intl.DisplayNames` + the endonym (e.g. "Thai — ไทย") so you can
    actually find the destination language; the header switcher keeps endonyms. New i18n
    keys (`diet.companions/companionsHint/addPerson/personName/removePerson`) added to
    en+he; other 22 langs fall back to English until translated.
  - **i18n expanded to 24 languages, 365 keys each, exact key parity** —
    EN/HE/ES/FR/DE/IT/PT/NL/SV/PL/CS/TR/EL/RU/UK/AR/HI/BN/TH/ID/VI/ZH/JA/KO. RTL for HE+AR
    (`RTL_LANGS` in `I18nProvider`). `LOCALES` map gives each its `Intl` locale (e.g.
    es-ES, ko-KR, bn-BD). Adding more = 1 `Dict` + 4 small list edits + a `LOCALES` entry
    (+ `RTL_LANGS` if RTL). Translations for Latin-script EU langs are A-grade; CJK/RTL/
    long-tail (ar/zh/ja/ru/hi/ko/id/vi/th/el/uk/bn) are best-effort, native review
    recommended for visible bullets before public push in those markets.
  - **Shift trip days when start_date moves** (`0022`, applied) — trip-editor
    detects start-date change, fetches existing days, prompts "Shift all N days by ±M?",
    and calls `shift_trip_days(_trip_id, _delta_days)` (SECURITY DEFINER, atomic
    `update days set date = date + N`). Anchors a cloned template to user's real dates,
    or fixes a freshly-created trip with default-today days. `daysBetween()` helper in
    `itinerary/dates.ts`; signed delta (`+7` / `-3`) in the prompt.
  - **Change a day's calendar date in place** — 📅 button on each day header opens an
    inline date picker; moves the day row (stops follow via FK). Rejects (toast) if a day
    already exists on the target date — explicit "stay with reject" decision.
  - **Itinerary leg fixes:** (1) leg-cost was invisible while the route time was loading
    (`legText` early-return now appends cost regardless of route state); (2) route legs
    didn't refresh after adding a stop until a tab switch (the fetch effect marked keys
    as "fetched" before storing — flipped to after, self-healing).
  - **Auth UI for public launch** — `Login.tsx` now has a "Create account" sign-up mode
    (email+password ≥ 8, "verify your email" notice when confirmation is on) and
    **Continue with Google / Continue with Facebook** buttons via `signInWithOAuth`.
    All inert until Supabase Auth toggles + OAuth client IDs are configured (see §8).
  - **Hardening:** `vercel.json` ships HSTS, `X-Content-Type-Options: nosniff`,
    `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, plus a **report-
    only CSP** matching the app's real sources. Password min raised 6 → 8.
  - **Vitest set up** — `npm test` / `npm run test:watch`, config inside `vite.config.ts`
    (Node env). First suite `src/places/mapsLink.test.ts` (10 cases for the Maps-link
    parser). Add jsdom + RTL for component tests later.
  - **Per-day reference places** (`0021`, `day_references` table) — day view's
    "📌 Nearby" panel: drag a palette place in (drop zone) or "+ Add reference"; each row
    shows routed drive distance/time from the **selected stop** (anchor), tap-to-call
    phone, notes, remove ×; that day's refs render as **red pins** on the day map.
  - **Map & Places layout** — side-by-side grid (lists left, sticky map right, ~380px)
    with **⤢ Bigger map** toggle; stacks (map on top) under 820px. Added
    `MapRenderer.invalidateSize()` + `ResizeObserver` in `MapView` so tiles re-render
    cleanly on resize.
  - **Print / export itinerary** — "🖨️ Print / PDF" button reveals a hidden, linear
    `PrintItinerary` doc via `@media print` (same reveal pattern as the allergy card).
    Per-day date/area/weather/note + stops + travel legs, then appended **trip notes**,
    **budget summary** (total + by-category) and **packing list**. Include/exclude
    toggles per section; per-day cost line; appended sections start on a fresh page.
  - **Import a place from a Maps link** — "📍 Add from link" box parses pasted Google/
    Apple Maps URLs, `geo:` URIs, and raw `lat,lng` (`src/places/mapsLink.ts`) → drops a
    pin + opens the editor prefilled. **Short links** (`maps.app.goo.gl` / `goo.gl/maps`
    / `maps.apple/p/…`) expanded by the keyless **`resolve-place` Edge Function**
    (SSRF-allowlisted, hop-capped, JWT-verified, per-user rate-limited via `resolve`
    bucket). Apple `/p/…` shortlinks may still fail because Apple resolves them in-app
    rather than via HTTP redirect — the fallback hint surfaces the full-URL path.
  - **Stadia Maps everywhere** — tiles (`osm_bright`), geocoding (Pelias), AND routing
    (Valhalla, `src/routing/stadia.ts`) when `VITE_STADIA_API_KEY` is set. OSRM / OSM /
    Nominatim stay as keyless fallbacks. So all three production map services run on
    Stadia today.
- **Earlier layers** (still relevant, condensed): trip cover emoji (`0010`), per-place
  color + city (`0011`), stop reminders + `.ics` (`0012`), editable travel legs (`0013`,
  `0018` per-leg cost), `poi_cache` (`0014`), expanded categories + Other (`0015`),
  profiles.email (`0016`), trip-owner-update check (`0017`), `consume_rate_limit`
  (`0019`, 60 search/hr + 100 details/day on `discover`), places.phone (`0020`),
  Foursquare Pro-tier search + on-demand premium details, per-day weather (Open-Meteo
  forecast ~16d + 10-yr climate-normal fallback), toast system across all panels, Sentry
  (errors-only, opt-in via `VITE_SENTRY_DSN`), ⚙️ gear menus (trip Edit/Delete, account),
  ✏️ Edit button on wishlist (click row = select+focus only).

### ⚠️ Operational state / pending for production (read this on a fresh start)
- **Supabase migrations `0001`–`0024` are applied** (incl. account deletion). ⚠️ **`0025`
  (destinations — extends `areas`) is NOT yet applied** — run [supabase/migrations/0025_destinations.sql](supabase/migrations/0025_destinations.sql)
  or the new **Route** tab can't save city coords/dates/transport. The "Delete account"
  action, Dietary "Other travelers" (`0023`), and "Shift all days" (`0022`) all work.
- **`discover` and `resolve-place` Edge Functions are both deployed.** Foursquare
  discovery + short-Maps-link resolution are live.
- **`VITE_STADIA_API_KEY` is set in Vercel** → Stadia tiles + geocoding + routing all
  live in production (with keyless OSM/Nominatim/OSRM fallbacks if the key ever clears).
- **`VITE_SENTRY_DSN` is set in Vercel** → Sentry error monitoring is live in
  production (and locally).
- **Public email sign-up is LIVE.** ✅ "Allow new users to sign up" + "Confirm email" are
  ON in Supabase, and confirmation/reset mail is delivered via **Resend on the verified
  `trippio.app` domain** (custom SMTP sender `noreply@trippio.app`; the old
  `onboarding@resend.dev` test sender is retired). Verified working with a real non-owner
  signup. **Social login was dropped** (email-only launch) — Google/Facebook buttons
  removed from `Login.tsx`. **No CAPTCHA yet** — if you enable it in Supabase later it will
  break signup/reset until the Turnstile/hCaptcha widget is wired into the forms (parked).
- **CSP is report-only** in `vercel.json`. After watching for violations in production,
  promote `Content-Security-Policy-Report-Only` → `Content-Security-Policy` (enforcing).
- **Foursquare billing cap not set yet** — recommended ~5-min job in the FSQ console.
  The hard backstop against a runaway bill even if every other control fails.

### Operational ops not blocking the app, but worth doing pre-launch
- Move `discover`'s cache key further (zoom/pan-tolerant) if discovery cost ever grows.
- Add CAPTCHA (Cloudflare Turnstile / hCaptcha) before opening sign-ups publicly.
- Apple sign-in is a one-line addition (`provider: 'apple'`) if iOS users expect it.

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
- **i18n:** custom lightweight solution in `src/i18n/` (24 languages: English, Hebrew, Spanish,
  French, German, Italian, Portuguese, Dutch, Swedish, Polish, Czech, Turkish, Greek,
  Russian, Ukrainian, Arabic, Hindi, Bengali, Thai, Indonesian, Vietnamese, Chinese,
  Japanese, Korean; RTL for Hebrew + Arabic).
- **Backend code:** one Supabase **Edge Function** (`supabase/functions/discover/`,
  Deno/TypeScript) for Foursquare discovery. Everything else is client + Supabase SQL.

---

## 3. How to run locally

```
npm install
npm run dev          # http://localhost:5173 (port pinned, strictPort)
npm run build        # tsc -b && vite build
npm run typecheck    # tsc -b --noEmit
npm test             # vitest run (unit tests; npm run test:watch to watch)
```

Tests use **Vitest** (`vitest.config` lives in `vite.config.ts`, `environment: 'node'`).
Unit tests sit next to the code as `*.test.ts` — currently `src/places/mapsLink.test.ts`
(the Maps-link parser). Add jsdom + React Testing Library later for component tests.

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
| `0020_place_reference.sql` | `places.phone` (tap-to-call in the day "Nearby" panel) + `places.is_reference` (a global flag — **superseded by `0021`; column now unused**) |
| `0021_day_references.sql` | `day_references` table (per-day reference places — a place tracked for distance on a specific day without being on its route) + RLS via `is_day_member` + realtime; also idempotently ensures `places.phone` |
| `0022_shift_trip_days.sql` | `shift_trip_days(_trip_id,_delta_days)` SECURITY DEFINER RPC (atomic `update days set date = date + N` — used by the trip editor when the start date moves, e.g. anchoring a cloned template to the user's real dates) |
| `0023_trip_companions.sql` | `trip_companions` table (per-trip people **without an app account** — children/companions — with `name`, `dietary_restrictions[]`, `dietary_note`; any member rw via `is_trip_member`; realtime) so their allergies appear on the allergy card |
| `0024_delete_account.sql` | `delete_account()` SECURITY DEFINER RPC (`delete from auth.users where id = auth.uid()`) for GDPR self-service account deletion; cascades remove the user's profile, owned trips + content, and memberships. EXECUTE granted to `authenticated` only |
| `0025_destinations.sql` | promotes `areas` into trip **destinations**: adds `country`, `lat`, `lng`, `start_date`, `end_date`, `transport_mode`/`_note`/`_cost` (the travel leg *into* the city). Powers the **Route** tab (ordered cities + map route). All optional; existing areas unaffected. RLS/realtime already cover `areas` |

**Data model (tables):**
- `profiles` (id→auth.users, display_name, email[mirrored from auth.users], dietary_restrictions[], dietary_note)
- `trips` (name, country, start_date, end_date, owner_id, currency, notes, cover_emoji)
- `trip_members` (trip_id, user_id, role: owner|editor)
- `areas` (trip_id, name, sort_order, **+ country, lat, lng, start_date, end_date, transport_mode/_note/_cost** from `0025`) — doubles as trip **destinations** (cities) for the Route tab; `days.area_id` links each day to its destination
- `days` (trip_id, date, area_id, note)
- `places` (trip_id, name, lat, lng, category[food|cafe|bar|sight|museum|outdoors|beach|hotel|shopping|transport|pharmacy|hospital|police|other], category_other[free-text label when category=other], google_place_id, notes, opening_hours, dietary_notes, color, city, est_cost, phone, is_reference[UNUSED — superseded by day_references], scheduled[UNUSED now])
- `stops` (day_id, place_id, sort_order, arrival_time, duration_min, cost, reminder_min, travel_mode, travel_min, travel_dist_m, travel_note, travel_cost)
- `route_cache` (origin, dest, mode, distance, duration, fetched_at)
- `budget_entries` (trip_id, area_id?, day_id?, category, amount, currency, note)
- `packing_items` (trip_id, label, packed, sort_order)
- `day_references` (day_id, place_id) — per-day reference places (distance shown without routing); RLS via `is_day_member`
- `trip_companions` (trip_id, name, dietary_restrictions[], dietary_note, created_by) — people on the trip without an app account (children/companions); allergies shown on the card; RLS via `is_trip_member`
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
- ✅ **Deployed.** Worth a one-time smoke test with a real `maps.app.goo.gl` link (the
  redirect-follow path can't be exercised without one).

---

## 5. Auth model (private, two users)

- **Methods:** magic link **and** email+password (both on the login screen).
- **Sign-ups are DISABLED** in Supabase. Accounts are created by hand
  (Authentication → Users → Add user). This keeps the app private to the two of us.
  NOTE: a **"Create account" sign-up UI now exists** in `Login.tsx` (email+password,
  min 8 chars, with a "verify your email" notice). It stays inert until you flip
  **Authentication → Allow new users to sign up** ON (the form just returns "Signups not
  allowed" otherwise) — so the app is still private until you decide to open it.
  **Social login** (Continue with Google / Facebook) buttons also exist (`signInWithOAuth`),
  inert until you create OAuth apps (redirect URI `https://<project>.supabase.co/auth/v1/callback`)
  and enable the providers in Supabase → Authentication → Providers.
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
    picker** — **trimmed for cost to Food · Hotels · Pharmacy · Hospital · Police**
    (cafés/bars/attractions/museums/outdoors/beaches/shopping and the free-text "other"
    search were removed; the unused `disco.cat.*`/`disco.otherPlaceholder` i18n keys are
    left dead). **Food** additionally shows **diet chips** (vegan/veg/gluten-free/kosher/
    halal) + a "Match my restrictions" button. "Search this area" queries the current map
    viewport.
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
    link. The top box stays "search a place by name" (Stadia/Nominatim) — distinct from
    discovery; it **searches on submit** (Enter or the 🔍 button), not as a debounced
    autocomplete, to save per-request geocoding cost. Map adapter has `getBounds()` +
    per-marker `color`; `MapView` exposes `MapApi`.
    **Layout (`.places-layout`):** map + lists sit **side by side** like the itinerary
    day view — discovery results + wishlist on the left (each a **capped internal-scroll
    box**), the **sticky map on the right** at a fixed **380px** (the "⤢ Bigger map"
    toggle was removed). Stacks to one column under 820px with the map on top (so tapping
    a place still shows it on a visible map — key on mobile). The map keeps an opaque bg +
    bottom shadow for the stacked case. `MapView` runs a `ResizeObserver` → renderer
    `invalidateSize()` so the map re-renders cleanly on stacking/orientation reflow.
  - **Place list interaction:** clicking a wishlist row **selects it + focuses the
    map** (no longer opens the editor); a dedicated **✏️ Edit** button per row opens
    the editor — so on mobile the editor modal no longer covers the map on every tap.
    Adding via drop-a-pin still opens the editor to name the new place.
  - **Dietary & allergies** (Dietary tab): each member sets their own restrictions
    (tag chips + free note) on their `profiles` row; other members' restrictions
    show read-only (live-synced). **"Other travelers"** section (`trip_companions`,
    `0023`) records allergies for people **without an app account** (children, a partner
    who doesn't use the app) — any member can add/edit/remove name + the same chips/note.
    Generates a **printable allergy card** (members **+ companions**) whose language is
    independent of the UI (defaults to the *other* app language so you can hand locals a
    card they read); the card's language picker labels each option in the user's own
    language via `Intl.DisplayNames` + endonym (e.g. "Thai — ไทย"). Food places gain a
    `dietary_notes` field.
  - **Mobile pass:** responsive layout; touch drag uses press-and-hold
    (MouseSensor + TouchSensor) so swipes still scroll.
  - **Day view layout:** stops + map **side by side** with a **sticky** map; trip
    page widened; stacks on mobile.
  - **Accessibility foundation:** focus-visible rings, reduced-motion, skip link,
    `<main>`/`<nav>` landmarks, aria-labels on icon buttons, keyboard-operable month
    cells + stop names, dnd-kit screen-reader announcements, AA contrast.
  - **RTL + multilingual i18n (24 langs: EN/HE/ES/FR/DE/IT/PT/NL/SV/PL/CS/TR/EL/RU/UK/AR/HI/BN/TH/ID/VI/ZH/JA/KO):**
    central dictionary `src/i18n/strings.ts` (twenty-four dicts with identical key sets — 358
    keys each), `I18nProvider`/`useT()`, header language switcher, persists choice, flips
    `dir`/`lang` via an `RTL_LANGS` set (he+ar=rtl; rest=ltr), default Hebrew. `Intl`
    locale per lang via a `LOCALES` map (he-IL, es-ES, fr-FR, de-DE, it-IT, pt-PT, ar,
    zh-CN, ja-JP, ru-RU, hi-IN, en). Missing keys fall back to English. Adding a language
    = one `Dict` + 3 small edits (Lang type, LANGUAGES, DICTS) + a LOCALES entry (and the
    RTL_LANGS/SUPPORTED lists).
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
7. **Hebrew default + multilingual switcher (12 langs: EN/HE/ES/FR/DE/IT/PT/AR/ZH/JA/RU/HI);** all strings in `src/i18n/strings.ts`.

---

## 8. Repo structure (src/)

```
App.tsx                      route gating (login / recovery / routes) + skip link
main.tsx                     providers: ErrorBoundary > I18n > Router > Auth > App
index.css                    all styles (logical props for RTL; mobile @media at bottom)
vite-env.d.ts

auth/        AuthProvider.tsx (session + passwordRecovery), Login.tsx, SetPassword.tsx
components/  AppHeader.tsx (name/lang/theme + ⚙️ account menu w/ "How it works"),
             ErrorBoundary.tsx, Menu.tsx (reusable ⚙️ dropdown), EmojiPicker.tsx,
             EmptyTip.tsx (inline empty-state hint), HelpGuide.tsx (how-it-works modal),
             Toast.tsx (ToastProvider + useToast — app-wide notifications/Undo)
i18n/        strings.ts (24 lang dicts), I18nProvider.tsx (useT), LanguageSwitcher.tsx
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
route/       RouteOverview.tsx (Route tab — ordered destinations/cities + map journey line)
routes/      Dashboard.tsx, TripView.tsx (tabs: route/places/itinerary/budget/packing/dietary + members + notes),
             Landing.tsx (logged-out marketing + Login; footer → /legal), Legal.tsx (Privacy + Terms, public /legal)
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
- **Bundle is code-split** (since the code-splitting pass): lazy routes + per-vendor
  chunks (leaflet/dndkit/supabase/sentry), so the landing page skips the map/itinerary
  libs and the >500 kB chunk warning is gone. Further wins available if needed:
  lazy-loading non-default i18n languages (the 24-lang dictionary is still eager) and
  splitting the per-tab panels inside `TripView`.
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
   in the Supabase SQL editor (the app won't apply it automatically). Latest = `0023`.
3. If `supabase/functions/discover/index.ts` changed, **redeploy the Edge Function**
   (Dashboard paste or `supabase functions deploy discover`) — pushing to git does NOT
   deploy it (only the Vercel frontend auto-deploys).
4. `git commit` + `git push origin main` → Vercel auto-deploys (~1 min). Hard-refresh.
5. Update this file + `LAUNCH-ROADMAP.md` status when finishing a chunk.

**Commit-message tip (Windows):** the Bash tool here is bash, not PowerShell — don't
use `-m @'...'@` (that injects a stray `@`). Use `git commit -F <file>` with a message
file, or a normal double-quoted `-m`.
