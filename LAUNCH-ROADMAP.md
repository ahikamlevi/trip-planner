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
- ☐ **"Deleted · Undo" toasts** (upgrade from confirm() dialogs). Note: the
  instant-save + realtime model makes true undo non-trivial — likely a deferred-
  delete toast pattern.
- ☑ **Stop reminders (calendar)**: per-stop "remind me N before" + an "Add to
  calendar" .ics export with alarms; the phone delivers them. **True web push**
  (notify with the app closed) is a later phase — needs PWA + Service Worker +
  Supabase scheduler (pg_cron + Edge Function) + VAPID; iOS requires the installed PWA.
- ☐ **Per-day weather** (Open-Meteo, keyless; forecast within range).
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
- ☐ **Error monitoring** (e.g. Sentry) + basic uptime/log alerts.
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
- ☐ **Per-user rate limit inside `discover`** (it's already JWT-verified, so we know the
  caller). Postgres-backed counter: `api_rate_limit` table + `consume_rate_limit(_user,
  _bucket, _limit, _window_seconds)` SECURITY-DEFINER RPC (fixed-window upsert returning
  whether under the limit); Edge Function returns **429** when exceeded. Limit the
  **premium/details** path harder than search (that's the costly one). `pg_cron` prunes
  old windows. (Alt: Upstash Redis `@upstash/ratelimit` — native in Deno Edge, faster,
  but an added dependency; Postgres is fine at our volume.) → new migration `0016`.
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

## Suggested sequence
0 (polish, in progress) → 1 (gate) → 2 (accounts) → 3 (data) → 4 (reach).
Phase 0 buys first impressions while Phase 1 is the hard prerequisite for opening
the doors; 2–4 can overlap once the gate is passed.
