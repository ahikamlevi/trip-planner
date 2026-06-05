# Trip Planner — Public Launch Roadmap

Goal: take the app from "private, two trusted users" to "polished public product
that delights any user." This is the tracking doc for that program. Pairs with
`PROGRESS.md` (current state) and `trip-planner-plan.md` (original build plan).

Status legend: ☐ not started · ◐ in progress · ☑ done

---

## Guiding principles
- **Best result for the user beats cheapest infra.** Pay for data quality where it
  shows (place ratings, photos, maps) and cache to keep the bill bounded.
- **Nothing public until the providers are safe.** Nominatim/OSRM/Overpass public
  servers are *not licensed for production volume* — they gate the launch.
- **Polish is a feature.** Theme, empty states, undo, loading — these decide whether
  a first-time user stays.

---

## Phase 0 — UX polish (FIRST, in progress)
The visible layer. What a new user judges in the first 30 seconds.

- ☑ **Visual redesign / theming.** Shipped the **"Daylight Teal"** palette as a
  polished **light theme (default) + refined dark theme**, system-aware, with a
  header toggle (persisted in localStorage like the language switcher). Tokenized all
  colors into `:root` + `:root[data-theme="dark"]`; `ThemeProvider` sets
  `data-theme` on `<html>`. Accent nudged to teal-700 in light for AA contrast on
  white-text buttons. (Next polish items below remain.)
- ☑ **Landing page** for logged-out visitors (hero, value-prop bullets, feature grid,
  embedded sign-in; theme + language available logged-out). `src/routes/Landing.tsx`.
- ☑ **Empty states** with guidance (dashboard: emoji + title + CTA button).
- ☑ **Loading skeletons** (shimmer rows on the dashboard; reduced-motion aware).
- ◐ **Trip cover emoji** done (preset picker on create + edit; shown on dashboard
  cards and trip header; migration `0010`). **Photos on places / image uploads**
  still pending (needs Supabase Storage).
- ◐ **Toasts + "Deleted · Undo"** — toast system shipped (`src/components/Toast.tsx`)
  and **adopted across all panels** (Places, Packing w/ re-insert Undo, Budget, Dietary,
  TripView, Itinerary): save confirmations + friendly localized errors everywhere.
  **Remaining:** a deferred-delete Undo for cascade-y deletes (place/trip) — non-trivial
  under instant-save + realtime — and optional collaborator-change pings.
- ☑ **Stop reminders (calendar)**: per-stop "remind me N before" + an "Add to
  calendar" .ics export with alarms; the phone delivers them. **True web push**
  (notify with the app closed) is a later phase — needs PWA + Service Worker +
  Supabase scheduler (pg_cron + Edge Function) + VAPID; iOS requires the installed PWA.
- ☑ **Per-day weather** — DONE. Open-Meteo (keyless, no migration); high/low + emoji
  on each itinerary day panel and month cell, per-day location (first located stop,
  falling back to the trip's first place). **Forecast** for the next ~16 days +
  **climate normal** ("typical for this time of year", 10-yr archive average) for
  planning further out — shown with a `≈`/italic so it's not mistaken for a forecast.
  `src/weather/openMeteo.ts` (`useTripWeather`); grouped by location, cached, best-effort.
- ☐ **Export / print** a clean itinerary (print stylesheet → PDF).
- ☑ **Editable travel legs** — click the connector between two stops to edit that leg:
  transport mode (walk/car/train/bus/bike/other, icon shown on the connector),
  manual time + distance overriding the auto OSRM values, and a per-leg note.
  Overrides win when set and feed the per-day travel total + the "too tight" time
  warning. Stored on the destination stop (`stops.travel_mode/_min/_dist_m/_note`,
  migration `0013`); editor `LegEditor` in `ItineraryBoard.tsx`.

## Phase 1 — Platform hardening (launch gate)
Required before any real traffic.

- ☐ **Proxy every third-party call behind Supabase Edge Functions** with the key
  server-side: discovery (Foursquare), geocoding, routing, tiles where needed.
- ◐ **Cache tables** (like `route_cache`) for POI/geocode/route results to cut cost
  and latency; respect each provider's caching terms. **POI done** (`poi_cache` +
  `discover` function, 7-day TTL, viewport-snapped key). Geocode/route caching TODO.
- ☐ **Per-user rate limiting + abuse/bot defense** (see the detailed plan below).
- ◐ **Error monitoring** — Sentry wired (`src/lib/sentry.ts`, `@sentry/react`; opt-in
  via `VITE_SENTRY_DSN`): uncaught/unhandled + render errors + light Web-Vitals tracing.
  **Remaining:** set the DSN in Vercel, source-map upload (readable stack traces), and
  Edge-Function (Deno) Sentry + uptime/log alerts.
- ☐ **DB review:** indexes on hot paths, RLS audit for untrusted users.

### Rate limiting & abuse defense — detailed plan
**Why it matters / threat model.** Three distinct stakes, not equal:
1. **Real money 🔴** — `discover` → Foursquare bills per *premium field × result*. An
   abuser (or a logged-in bot) varying the viewport to bust `poi_cache` can run up a bill.
2. **Shared availability 🟠** — once we proxy Nominatim/OSRM/Overpass behind Edge
   Functions (above), abuse uses **our** IP → those public servers throttle/ban us for
   *everyone*. (Today they're called from the browser, i.e. each user's own IP.)
3. **Auth & data 🟡** — login/forgot brute-force, signup spam (post-launch), bulk writes.

**Architectural constraint.** The SPA talks **directly** to PostgREST with the user's
JWT — we can't bolt a limiter onto the managed DB API. Enforcement therefore lives in
one of three places: **Supabase Auth (built-in)**, **our Edge Functions (custom)**, or
**the database (triggers/quotas)**. A CDN in front of Vercel guards the *frontend* only,
not direct `*.supabase.co` calls.

**Plan, in priority order:**
- ☐ **Foursquare billing cap + spend alert** (do first; ~5 min in the FSQ console). The
  backstop — caps the bill even if every other control fails. Highest leverage.
- ☑ **Per-user rate limit inside `discover`** — DONE (migration `0019`). `api_rate_limit`
  table + `consume_rate_limit(_user,_bucket,_limit,_window_seconds)` SECURITY-DEFINER RPC
  (fixed-window, self-pruning → no pg_cron; client EXECUTE revoked). The function reads
  the caller's JWT `sub`, checks the limit before each cache-miss call, and returns **429**
  when over. **search 60/hr, details 100/day** (details = the Premium-billed path, capped
  harder). Cache hits don't count; fails open on any limiter error.
- ☐ **Harden the cache against busting** — keep the `poi_cache` viewport key coarse
  (~1 km) and rate-limit per-place *details* fetches specifically; caching + rate limit
  together bound the marginal cost of a determined attacker.
- ☐ **Bot front door** (when public sign-ups open, Phase 2): enable **CAPTCHA in Supabase
  Auth** (Cloudflare Turnstile / hCaptcha on signup, sign-in, password reset) — the single
  most effective anti-bot lever; tune **Supabase Auth's built-in rate limits** (emails/hr,
  OTP, token verify, sign-ups, sign-ins); require **email verification** before any
  billable action.
- ☐ **DB write quotas** — `BEFORE INSERT` trigger capping a user's rows/hour on
  `places`/`stops`/`packing_items` (RLS already scopes access; this bounds volume).
- ☐ **Usage monitoring + anomaly alert** (pairs with Sentry above) — per-user usage
  logging; can't rate-limit what we can't see.

## Phase 2 — Accounts & onboarding
Turn "manually-created accounts" into self-serve.

- ☐ **Enable public sign-ups** + email verification.
- ☐ **Onboarding flow** (create first trip, sample data, guided tips).
- ☐ **Generalized roles:** owner / editor / **viewer** (read-only share links).
- ☐ Polished password reset + account settings + delete-account (GDPR).
- ☐ Abuse controls (signup throttling, disposable-email guard) — see the
  **Rate limiting & abuse defense** plan under Phase 1.

## Phase 3 — Data quality
Make the recommendations genuinely good.

- ◐ **Foursquare-backed discovery** (ratings, categories, dietary) — built: `discover`
  Edge Function (`supabase/functions/discover/`) + client provider, with Overpass
  fallback. **Needs deploy + `FOURSQUARE_API_KEY` secret to go live.** This is also
  the project's first Edge Function (the Phase-1 hardening pattern). Photos/Place
  Details enrichment still TODO.
- ☐ Optional **Google Place Details** on-demand for a place's reviews/photos.
- ☐ Multi-currency with live FX; richer budget insights.

## Phase 4 — Reach & quality bar
- ☐ **Code-splitting** (bundle is ~650 kB; lazy-load Leaflet/dnd-kit per route).
- ☐ **SEO / Open Graph** tags, sitemap, shareable trip preview cards.
- ☐ **PWA / installable + offline** itinerary.
- ☐ **Lighthouse** pass (perf/SEO/best-practices/a11y all green).
- ☐ Formal **WCAG 2.1 AA** audit + screen-reader testing + accessibility statement.
- ☐ Expand i18n beyond EN/HE as demand appears.

---

## Improvement audit (2026-06) — findings & status
A multi-angle review (security, code/architecture, UX/features, tech best-practices,
with web research) produced the backlog below. Items already addressed in existing
phases are cross-referenced, not duplicated.

### Security (audit)
- ☑ **Stored XSS in map tooltips** — place-name labels hit Leaflet's `innerHTML`
  unescaped (`src/map/leaflet/LeafletRenderer.ts`). Fixed: labels are now
  `escapeHtml`-escaped before `bindTooltip`. (Popups were already escaped.)
- ☑ **Edge Function leaked raw upstream error text** to clients
  (`supabase/functions/discover/index.ts`). Fixed: upstream detail is logged to the
  function logs; the client now gets a generic `discovery_failed`. **Needs redeploy.**
- ☑ **`trips` UPDATE policy had no `WITH CHECK`** → owner could reassign `owner_id`
  and orphan the trip. Fixed in migration `0017`.
- ☐ **Foursquare billing cap + spend alert** (FSQ console, ~5 min) — the money
  backstop. Do before public launch. (Pairs with the rate-limit plan in Phase 1.)
- ☐ **`route_cache` open to any authenticated write** (cache poisoning / bloat) —
  add a numeric-range `CHECK` + periodic prune, or fold routing behind an Edge
  Function (Phase 1 proxy work).
- ☐ **Tighten `invite_member_by_email`** (email-enumeration: distinct
  `no_account`/`already_member`) once public sign-ups open.
- ☐ **Raise password min length** (currently 6) for public launch.
- ☐ **RLS isolation test** — a two-user / pgTAP test proving user B can't read
  user A's data, run in CI. (Also under Engineering health.)
- Verified-clean: no `service_role` in client, secrets clean, `poi_cache`/`profiles`
  RLS correct, SECURITY DEFINER funcs sound, popups/JSX escaped, `npm audit` prod-clean.

### Engineering health (audit)
- ☐ **Add a test harness** — Vitest + RTL for units (start with pure logic:
  `dates.ts`, `ics.ts`, `money.ts`, the itinerary "too-tight/busy-day" math), one
  Playwright happy-path e2e. *Zero tests today — biggest single gap.*
- ☐ **Add ESLint + Prettier** (and `eslint-plugin-react-hooks`) — 6 files already
  carry hand-written `eslint-disable` comments but nothing runs them.
- ☐ **Code-split the ~690 kB bundle** — `React.lazy` the routes + dynamic-`import()`
  Leaflet and @dnd-kit (map/itinerary only); `manualChunks` for vendor caching;
  add `rollup-plugin-visualizer`. (Overlaps Phase 4 code-splitting.)
- ☐ **Split `ItineraryBoard.tsx`** (1,354 lines, ~12 components) along its existing
  seams; memoize `DayPanel`'s per-render leg/warning computation.
- ☐ **Surface swallowed mutation errors** — many writes (`ItineraryBoard`
  commit/remove/clearDay, `PackingPanel`, `TripView`) ignore `.error` and fail
  silently; thread them to the UI (pairs with the toast system below).
- ☐ **Regenerate `database.types.ts` from migrations** (`supabase gen types`) — the
  hand-authored file is drifting (stale comment, `poi_cache` absent, one RPC typed).
- ☐ **Collapse N+1 fetches** (`ItineraryBoard`/`BudgetPanel` fetch days then stops)
  into nested selects; forward an abort signal to discovery search.
- ☐ **Add a unique constraint on `days(trip_id, date)`** + upsert to prevent the
  duplicate-day race in `ensureDay`.

### UX (audit) — feeds Phase 0
- ☑ **Global toast system** — DONE. `src/components/Toast.tsx` (`ToastProvider`/
  `useToast`) confirms saves, shows friendly errors, supports Undo — adopted across
  all panels (Places, Packing, Budget, Dietary, TripView, Itinerary). Remaining
  follow-ups: collaborator-change pings + deferred-delete Undo for cascade-y deletes.
- ☐ **Real empty states + center map on the trip's country** (reuse the dashboard's
  `empty-state` component) instead of a zoom-2 globe + one-line hint.
- ☐ **Friendly, localized error messages** + replace native `confirm()`/`alert()`
  with themed RTL modals (users currently can see raw RLS errors).
- ☐ Move invite/members out of the bottom `<details>` into a Share affordance;
  plan tab overflow (mobile bottom-tab bar) before adding more tabs.
- ☐ Collapse the dense `StopItem` controls behind an edit affordance on mobile;
  extend the dashboard skeleton loader to the tab panels.

### Feature ideas (audit) — feeds Phase 3
- ☐ **Expense splitting** (`paid_by` + settle-up) — top group-travel differentiator;
  builds on the existing budget model; keyless.
- ☐ **Route optimization** — nearest-neighbor reorder of a day's stops over the OSRM
  legs already fetched; one-tap "apply". Keyless, high wow-factor.
- ☐ **Group voting / ❤️ on wishlist places** — cheap collaboration win, reuses realtime.
- ☐ **Packing templates + drag-reorder/categories** (`sort_order` already in schema).
- ☐ **Per-place / per-stop comments** (attributed, realtime).
- ☐ **Manual bookings section** (flights/lodging/confirmations as timed stops).
- ◐ **Import a place from a Maps link** (code complete; Phase 2 pending a function
  deploy) — the inbound counterpart to the existing
  "Maps ↗" out-links. A "Paste a Maps link" box where the user pastes what they
  already copied (the only easy action they know: **Share → Copy link** in
  Google/Apple Maps), and we extract the coordinates **for** them, then drop a pin +
  prefill the name via the existing `addPlace`/`reverseCity` flow.
  - **Phase 1 — DONE (client-only, no deploy):** `src/places/mapsLink.ts`
    (`parseMapsLink`, pure/testable) handles full Google URLs (prefers the real
    `!3d!4d` marker over the `@` viewport), `/maps/search?query=`, `?q=`, Apple
    `?ll=&q=`, `geo:` URIs (incl. the `geo:0,0?q=lat,lng(Label)` form), and raw
    `lat,lng`. UI = a dedicated "📍 Add from link" box under the name search
    (`PasteMapsLink` in `PlacesWorkspace.tsx`); on parse it reverse-geocodes the city
    and opens the place editor prefilled via the existing `pending` flow. Coords-only
    links are accepted (unnamed pin). Strings in `i18n/strings.ts` (`places.pasteLink*`).
  - **Phase 2 — CODE DONE, needs deploy:** `maps.app.goo.gl` / `goo.gl/maps` carry **no
    coordinates** and are an opaque cross-origin redirect the browser can't follow —
    `parseMapsLink` returns `{ kind: 'needs-resolver', url }` and the client posts it to
    the new **keyless `resolve-place` Edge Function** (`supabase/functions/resolve-place/`).
    It follows the redirect server-side (`redirect: 'manual'`, reads `Location` per hop),
    parses coords + name from the expanded URL (canonical/og:url/`!3d!4d` body scan as
    fallback). **SSRF-guarded** (allowlist `goo.gl`/`google.*`/`maps.apple.com` on start
    URL + every hop, hop cap 6, body never returned) and folded under the per-user rate
    limiter (`consume_rate_limit`, `resolve` bucket, 60/hr, fails open). **No migration/
    secret.** ⚠️ Deploy it (PROGRESS §4.2) then verify with a real short link; until then
    short links degrade to the "paste the full URL" hint.
  - **Ultimate UX (needs PWA):** register as a **Web Share Target** so "Share →
    Trip Planner" appears in the phone share sheet — no paste at all. Ties to the PWA
    item in Phase 4; the paste box is the works-today version.
- ☐ **AI "draft a day from my wishlist"** assistant (paid API, behind an Edge
  Function like `discover`) — standout differentiator if paid APIs are ever in scope.

### Tech best-practices (audit) — feeds Phase 1/4
- ◐ **Error monitoring (Sentry)** — React app DONE (`src/lib/sentry.ts`, opt-in via
  `VITE_SENTRY_DSN`). Remaining: set the DSN in Vercel, source-map upload, and
  instrument the Edge Function.
- ☐ **Security headers + CSP in `vercel.json`** (HSTS, X-Content-Type-Options,
  X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP report-only first).
- ☐ **PWA + offline** (`vite-plugin-pwa`) — app shell + current-trip + tiles cached;
  disproportionately valuable for travel (signal loss abroad). (Phase 4.)
- ✅ **Managed maps/geo provider** — DONE. All three Stadia-backed when
  `VITE_STADIA_API_KEY` is set (else keyless OSM fallbacks): **tiles**
  (`src/map/tiles.ts`, `osm_bright`), **geocoding** (`places/search.ts`, Pelias
  autocomplete + reverse), and **routing** (`routing/stadia.ts`, Valhalla — replacing
  the OSRM demo server, which stays as fallback). Removes the top infra/outage risk.
  Remaining nuance: the free Stadia tier is non-commercial — a public launch needs a
  paid plan, and the browser-exposed key should stay domain-restricted in the dashboard.
- ☐ **RLS performance**: wrap `auth.uid()` as `(select auth.uid())` and index
  policy-filter columns before traffic grows.
- ☐ **Supabase backups/PITR** + Supavisor transaction-mode pooling for the edge path.

## Suggested sequence
0 (polish, in progress) → 1 (gate) → 2 (accounts) → 3 (data) → 4 (reach).
Phase 0 buys first impressions while Phase 1 is the hard prerequisite for opening
the doors; 2–4 can overlap once the gate is passed.
