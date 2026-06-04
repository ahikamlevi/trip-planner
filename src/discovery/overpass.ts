// POI discovery via OpenStreetMap's Overpass API — no API key.
// Same data behind your map tiles, so suggestions line up with what's drawn.
//
// Reliability: the public Overpass servers rate-limit and occasionally time out, so
// we fail over across several mirrors and give each a client-side timeout. Coverage
// still depends on what OSM contributors tagged — for a polished public product this
// would move to a paid POI provider (Foursquare) behind an Edge Function with caching.
import type { DiscoveryProvider, DiscoveryQuery, DiscoveryResult } from './DiscoveryProvider'
import type { PlaceCategory } from '../lib/database.types'

// Tried in order; on rate-limit / timeout / network error we move to the next.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

const REQUEST_TIMEOUT_MS = 15_000

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function buildQuery(q: DiscoveryQuery): string {
  const { south, west, north, east } = q.bounds
  const bbox = `${south},${west},${north},${east}`
  // 'other' category: best-effort name regex from the free text.
  if (q.category.key === 'other') {
    const term = (q.freeText ?? '').trim().replace(/["\\]/g, '')
    const sel = term ? `["name"~"${term}",i]` : `["name"]`
    return `[out:json][timeout:25];(nwr${sel}(${bbox}););out center ${q.limit ?? 50};`
  }
  // Diets only apply to food; the UI only sends them for the food category.
  const dietFilters = q.diets.map((d) => `["diet:${d}"~"yes|only"]`).join('')
  const body = `nwr["name"]${q.category.osm}${dietFilters}(${bbox});`
  return `[out:json][timeout:25];(${body});out center ${q.limit ?? 50};`
}

async function postWithTimeout(
  url: string,
  body: string,
  signal: AbortSignal | undefined,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: ctrl.signal,
    })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function parseElements(elements: OverpassElement[], placeCategory: PlaceCategory, icon: string): DiscoveryResult[] {
  const seen = new Set<string>()
  const out: DiscoveryResult[] = []
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    const name = el.tags?.name
    if (lat == null || lng == null || !name) continue

    // De-dupe a place that exists as both a node and a way/relation.
    const key = `${name}@${lat.toFixed(4)},${lng.toFixed(4)}`
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      id: `${el.type}/${el.id}`,
      name,
      lat,
      lng,
      kind: el.tags?.amenity ?? el.tags?.tourism ?? el.tags?.shop ?? 'place',
      cuisine: el.tags?.cuisine?.replace(/[_;]/g, ' '),
      placeCategory,
      icon,
      source: 'osm' as const,
    })
  }
  return out
}

export const discoverViaOverpass: DiscoveryProvider = async (q, signal) => {
  const body = 'data=' + encodeURIComponent(buildQuery(q))
  let lastError: unknown = null

  for (const endpoint of ENDPOINTS) {
    if (signal?.aborted) break
    try {
      const res = await postWithTimeout(endpoint, body, signal, REQUEST_TIMEOUT_MS)
      if (!res.ok) {
        // 429 (rate limit) / 504 (timeout) / 503 (overloaded) → try the next mirror.
        lastError = new Error(`status ${res.status}`)
        continue
      }
      const json: { elements?: OverpassElement[] } = await res.json()
      return parseElements(json.elements ?? [], q.category.placeCategory, q.category.icon)
    } catch (err) {
      // A real user-initiated abort should propagate; mirror failures fall through.
      if (signal?.aborted) throw err
      lastError = err
      continue
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Discovery unavailable')
}
