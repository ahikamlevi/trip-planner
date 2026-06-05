// Supabase Edge Function: expand a short Google Maps link into coordinates + name.
// The inbound counterpart to the client's parseMapsLink — short links
// (maps.app.goo.gl / goo.gl/maps) carry NO coordinates and are an opaque cross-origin
// redirect the browser can't follow, so the client posts the URL here and we follow the
// redirect server-side, then parse coords (+ place name) out of the expanded URL.
//
// Keyless (no third-party API) — it just follows a redirect. JWT-verified like
// `discover`, so only signed-in users can reach it, and rate-limited per user.
//
// SECURITY: this is a server that fetches a URL the client supplies → an SSRF vector.
// It is locked down by (1) an allowlist of Google/Apple map hosts checked on the start
// URL and EVERY redirect hop, (2) a hop cap, (3) never returning the fetched body to
// the client — only parsed lat/lng/name.
//
// Deploy:   supabase functions deploy resolve-place
//           (or Dashboard → Edge Functions → resolve-place → paste → Deploy)
// No secret needed. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected and used
// only for the shared per-user rate limiter (consume_rate_limit, migration 0019).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const sb = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null

// A real desktop UA so Google serves the normal redirect/page (not a minimal variant).
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_HOPS = 6
const MAX_BODY = 250_000 // cap the fallback body scan

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

// --- Per-user rate limiting (reuses the discover limiter; new 'resolve' bucket) ---
function userIdFromReq(req: Request): string | null {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '==='.slice((b64.length + 3) % 4)
    return JSON.parse(atob(padded)).sub ?? null
  } catch {
    return null
  }
}

// Fails OPEN (allows) if it can't enforce, like discover — a limiter hiccup or an
// unapplied migration must never break the feature. This call is keyless/free anyway;
// the limit is just abuse protection against using us as a redirect-follower.
async function underLimit(userId: string | null): Promise<boolean> {
  if (!sb || !userId) return true
  try {
    const { data, error } = await sb.rpc('consume_rate_limit', {
      _user: userId,
      _bucket: 'resolve',
      _limit: 60,
      _window_seconds: 3600,
    })
    if (error) {
      console.error('rate-limit check failed (allowing):', error.message)
      return true
    }
    return data === true
  } catch (e) {
    console.error('rate-limit check threw (allowing):', e)
    return true
  }
}

// --- SSRF allowlist: only Google/Apple map hosts, on the start URL and every hop. ---
function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'goo.gl' || h.endsWith('.goo.gl')) return true // incl. maps.app.goo.gl
  if (h === 'apple.com' || h.endsWith('.apple.com')) return true // maps.apple.com
  // google.com / www.google.com / maps.google.com / consent.google.com / google.co.uk …
  return /(^|\.)google(\.[a-z]{2,3}){1,2}$/.test(h)
}

// --- Coordinate + name parsing (server mirror of src/places/mapsLink.ts) ---
function parseLatLng(s: string | null | undefined): { lat: number; lng: number } | null {
  if (!s) return null
  const m = s.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function decodeName(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  try {
    const s = decodeURIComponent(raw.replace(/\+/g, ' ')).trim()
    return s && !parseLatLng(s) ? s : undefined
  } catch {
    return undefined
  }
}

function extractFromUrl(href: string): { lat: number; lng: number; name?: string } | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const path = url.pathname
  const params = url.searchParams
  const name =
    decodeName(path.match(/\/place\/([^/@]+)/)?.[1]) ??
    decodeName(params.get('q')) ??
    decodeName(params.get('query')) ??
    decodeName(params.get('name'))
  const marker = path.match(/!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/)
  const at = path.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/)
  const coords =
    (marker && parseLatLng(`${marker[1]},${marker[2]}`)) ||
    (at && parseLatLng(`${at[1]},${at[2]}`)) ||
    parseLatLng(params.get('ll')) ||
    parseLatLng(params.get('sll')) ||
    parseLatLng(params.get('q')) ||
    parseLatLng(params.get('query')) ||
    parseLatLng(params.get('daddr'))
  return coords ? { ...coords, name } : null
}

// Fallback when the expanded URL itself lacks coords but we got an HTML page from an
// allowlisted host: pull the canonical/og:url link, else scan for raw coord patterns.
function extractFromBody(body: string): { lat: number; lng: number; name?: string } | null {
  const canonical =
    body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
    body.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1]
  if (canonical) {
    const fromCanon = extractFromUrl(canonical.replace(/&amp;/g, '&'))
    if (fromCanon) return fromCanon
  }
  const marker = body.match(/!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/)
  if (marker) {
    const c = parseLatLng(`${marker[1]},${marker[2]}`)
    if (c) return c
  }
  const at = body.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/)
  if (at) {
    const c = parseLatLng(`${at[1]},${at[2]}`)
    if (c) return c
  }
  return null
}

// Follow redirects hop-by-hop, validating every host. Returns the final URL and, if the
// terminal response is HTML, its (size-capped) body for the fallback scan.
async function expand(startUrl: string): Promise<{ url: string; body?: string } | null> {
  let current = startUrl
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let u: URL
    try {
      u = new URL(current)
    } catch {
      return null
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!isAllowedHost(u.hostname)) return null

    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).href // resolve relative redirects
      // cancel the (empty) redirect body
      await res.body?.cancel()
      continue
    }
    // Terminal response — read the body only from an allowlisted host (it is), capped.
    let body: string | undefined
    try {
      body = (await res.text()).slice(0, MAX_BODY)
    } catch {
      /* ignore */
    }
    return { url: current, body }
  }
  return null // too many hops
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { url } = await req.json().catch(() => ({ url: null }))
    if (typeof url !== 'string' || !url.trim()) return json({ error: 'url is required' }, 400)

    let start: URL
    try {
      start = new URL(url.trim())
    } catch {
      return json({ error: 'invalid_url' }, 400)
    }
    // Reject anything not on the map-host allowlist before making any request.
    if (!isAllowedHost(start.hostname)) return json({ error: 'host_not_allowed' }, 400)

    if (!(await underLimit(userIdFromReq(req)))) return json({ error: 'rate_limited' }, 429)

    const expanded = await expand(start.href)
    if (!expanded) return json({ error: 'resolve_failed' }, 422)

    const place = extractFromUrl(expanded.url) ?? (expanded.body ? extractFromBody(expanded.body) : null)
    if (!place) return json({ error: 'no_coordinates' }, 422)

    return json({ lat: place.lat, lng: place.lng, name: place.name ?? null })
  } catch (e) {
    console.error('resolve-place error:', e)
    return json({ error: 'resolve_failed' }, 500)
  }
})
