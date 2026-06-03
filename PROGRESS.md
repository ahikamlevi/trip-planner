# Trip Planner — Project Handoff / Progress

A collaborative day-by-day trip planner for two people (owner + partner). Built
public-ready but scoped for two private users now. **Live and in real use.**

This document is the single source of truth for picking up work in a new session.
See also: `trip-planner-plan.md` (original build plan), `SETUP.md`, `DEPLOY.md`,
`SMTP-SETUP.md`.

---

## 1. Current status — DONE

Core v1 (Stages 1–6) **plus** a large set of polish/extra features are complete,
deployed, and verified in production. Both users can log in and edit a shared trip
live.

- **Live URL:** https://trip-planner-pearl-eight.vercel.app
- **GitHub:** `ahikamlevi/trip-planner` (branch `main`)
- **Hosting:** Vercel, auto-deploys on every push to `main`.
- Both accounts (owner + partner) confirmed working and sharing.

---

## 2. Tech stack

- **Frontend:** React 18 + TypeScript + Vite. Plain CSS in `src/index.css` (no
  Tailwind/UI lib). Routing via `react-router-dom`.
- **Backend:** Supabase — Postgres, Auth, Row Level Security, Realtime.
- **Map:** Leaflet + OpenStreetMap tiles, behind a swappable `MapRenderer` adapter
  (`src/map/`). Place search via OSM Nominatim (`src/places/search.ts`).
- **Routing/travel time:** OSRM public server (keyless), behind a swappable
  `RouteProvider` adapter (`src/routing/`), results cached in `route_cache`.
- **Place discovery:** behind a swappable `DiscoveryProvider` adapter
  (`src/discovery/`). Primary = **Foursquare** via the `discover` Supabase **Edge
  Function** (key server-side; richer data + ratings); **falls back to Overpass**
  (keyless OSM) if the function errors / isn't deployed. Finds food POIs in the
  current map view, filterable by diet (vegan/vegetarian/gluten_free/kosher/halal).
- **Drag & drop:** `@dnd-kit` (core, sortable, utilities).
- **i18n:** custom lightweight solution in `src/i18n/` (English + Hebrew, RTL).
- **No backend code of our own** beyond SQL — everything is client + Supabase. No
  Edge Functions deployed yet (planned for billable providers later).

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
```
Both come from Supabase → Project Settings → API. Never commit the service_role key.

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

**Data model (tables):**
- `profiles` (id→auth.users, display_name, dietary_restrictions[], dietary_note)
- `trips` (name, country, start_date, end_date, owner_id, currency, notes, cover_emoji)
- `trip_members` (trip_id, user_id, role: owner|editor)
- `areas` (trip_id, name, sort_order)
- `days` (trip_id, date, area_id, note)
- `places` (trip_id, name, lat, lng, category[food|sight|beach|hotel|transport], google_place_id, notes, opening_hours, dietary_notes, color, city, est_cost, scheduled[UNUSED now])
- `stops` (day_id, place_id, sort_order, arrival_time, duration_min, cost, reminder_min, travel_mode, travel_min, travel_dist_m, travel_note)
- `route_cache` (origin, dest, mode, distance, duration, fetched_at)
- `budget_entries` (trip_id, area_id?, day_id?, category, amount, currency, note)
- `packing_items` (trip_id, label, packed, sort_order)

**RLS model:** every row is reachable only by members of its trip
(`is_trip_member` / `is_day_member`). `route_cache` is readable/writable by any
authenticated user (cache only). Types hand-authored in
`src/lib/database.types.ts` (regenerate via `supabase gen types` if desired).

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
- **Stage 6 — Budget, notes & Today:** Budget tab (total = per-stop costs + manual
  entries; By-category and By-day rollups; add/delete "other costs"); single trip
  **currency** (Intl-formatted); **trip-level notes** (owner-editable); notes
  surfaced on stop cards + palette; **Today-aware** (auto-opens to Itinerary→Day on
  today when traveling; today highlighted everywhere).
- **Extras / polish:**
  - **Live realtime sync** (`useTripRealtime`): Supabase Realtime → debounced reload
    on any trip-table change. Edits appear for both users without refresh.
  - **Shared packing checklist** (Packing tab, live-synced).
  - **Place discovery** (Map & places tab): "Find food nearby" bar with diet-tag
    chips + "Search this area" (queries Overpass for the current viewport).
    Suggestions appear as **green pins** + a results list; tap "+ Add" (or the green
    pin) to drop one into the wishlist. A "Match my restrictions" button maps the
    user's dietary profile onto the diet filters. Map adapter gained `getBounds()`
    and a per-marker `color` override; `MapView` exposes a `MapApi` via `onReady`.
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
  - **Editable travel legs**: click the connector between two stops to set transport
    mode (walk/car/train/bus/bike/other), override the auto time/distance, and add a
    per-leg note. Overrides win over OSRM and feed the day travel total + "too tight"
    warning. Also a tap-to-add "+ Add a place" button per day (mobile-friendly add
    without dragging).
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
  - **Error boundary** (shows the error instead of a blank page).
  - **Destructive-delete confirmations** (place, member, budget entry, trip,
    clear-day). Stop-remove and packing-uncheck stay instant (easily reversible).

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
components/  AppHeader.tsx (name/password/lang/signout), ErrorBoundary.tsx
i18n/        strings.ts (EN+HE dict), I18nProvider.tsx (useT), LanguageSwitcher.tsx
theme/       ThemeProvider.tsx (useTheme; light/dark, sets data-theme on <html>)
lib/         supabase.ts, database.types.ts (hand-authored), useTripRealtime.ts
map/         MapRenderer.ts (interface), MapView.tsx (React wrapper), index.ts (active
             provider), leaflet/LeafletRenderer.ts
places/      PlacesWorkspace.tsx (map tab), categories.ts, search.ts (Nominatim), dietary.ts (tags)
discovery/   DiscoveryProvider.ts (interface), overpass.ts, index.ts (active provider)
itinerary/   ItineraryBoard.tsx (calendar + dnd, BIG file), dates.ts (Intl-based)
routing/     RouteProvider.ts (interface), osrm.ts, index.ts (getRouteCached, getRoutePathCached)
budget/      BudgetPanel.tsx, money.ts (Intl currency)
packing/     PackingPanel.tsx
dietary/     DietaryPanel.tsx (self-editor + members overview + printable allergy card)
routes/      Dashboard.tsx, TripView.tsx (tabs: places/itinerary/budget/packing/dietary + members + notes)
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
- **Bundle size warning** on build (Leaflet + dnd-kit > 500kB) — advisory only;
  code-splitting is a future option.
- **Line endings:** git warns LF→CRLF on Windows; harmless.
- **Translations** are functional but subjective — Hebrew wording can be tweaked
  per key in `src/i18n/strings.ts`.

---

## 10. Future plans (parked)

**Original Stage 7 (public polish — only if opening beyond two users):**
- Onboarding flow, public landing page, rate limiting, autocomplete session tokens,
  monitoring, budget alerts.
- Generalize sharing/roles (owner vs editor) for untrusted users.
- Move billable map/route/search calls behind Supabase Edge Functions.

**Accessibility:**
- Formal **WCAG 2.1 AA** conformance: full audit, screen-reader testing
  (NVDA/VoiceOver), accessibility statement. (Foundation done; do this when the UI
  is stable / before going public. In Israel, IS 5568 ≈ WCAG 2.0 AA applies to
  public services, not a private 2-person app.)

**Feature ideas raised but not built:**
- "Deleted · Undo" toasts (chosen confirmations instead, but undo is a nice upgrade).
- Packing list templates; print/export a clean itinerary (PDF/offline).
- Trip cover image/emoji; photos on places; per-day weather.
- Area management/reordering UI (currently create + assign only).
- Real road geometry cached in DB; multi-currency.
- Code-splitting to shrink the bundle.

**Immediate small follow-ups available:**
- Apply the side-by-side/sticky-map treatment to the Week view.
- Click-to-focus refinements; Hebrew wording review.

---

## 11. Typical workflow for changes

1. Edit code → `npm run typecheck` (or `npx tsc -b`) and `npm run build` to verify.
2. If schema changed, add a numbered migration in `supabase/migrations/` AND run it
   in the Supabase SQL editor (the app won't apply it automatically).
3. `git commit` + `git push origin main` → Vercel auto-deploys (~1 min). Hard-refresh.
4. Update this file + `trip-planner-plan.md` status when finishing a chunk.
