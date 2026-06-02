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
- ☐ **Landing page** for logged-out visitors (value prop, screenshots, CTA).
- ☐ **Empty states** with guidance (no trips, no places, no days yet).
- ☐ **"Deleted · Undo" toasts** (upgrade from confirm() dialogs).
- ☐ **Trip cover image / emoji** + **photos on places** (Supabase Storage).
- ☐ **Per-day weather** (forecast within range, historical-average beyond).
- ☐ **Export / print** a clean itinerary (PDF + offline).
- ☐ **Loading skeletons** instead of "Loading…" text.

## Phase 1 — Platform hardening (launch gate)
Required before any real traffic.

- ☐ **Proxy every third-party call behind Supabase Edge Functions** with the key
  server-side: discovery (Foursquare), geocoding, routing, tiles where needed.
- ☐ **Cache tables** (like `route_cache`) for POI/geocode/route results to cut cost
  and latency; respect each provider's caching terms.
- ☐ **Per-user rate limiting** + quota guards on those functions.
- ☐ **Error monitoring** (e.g. Sentry) + basic uptime/log alerts.
- ☐ **DB review:** indexes on hot paths, RLS audit for untrusted users.

## Phase 2 — Accounts & onboarding
Turn "manually-created accounts" into self-serve.

- ☐ **Enable public sign-ups** + email verification.
- ☐ **Onboarding flow** (create first trip, sample data, guided tips).
- ☐ **Generalized roles:** owner / editor / **viewer** (read-only share links).
- ☐ Polished password reset + account settings + delete-account (GDPR).
- ☐ Abuse controls (signup throttling, disposable-email guard).

## Phase 3 — Data quality
Make the recommendations genuinely good.

- ☐ **Foursquare-backed discovery** (ratings, photos, categories, dietary) behind the
  Edge Function from Phase 1, augmenting/replacing Overpass.
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
