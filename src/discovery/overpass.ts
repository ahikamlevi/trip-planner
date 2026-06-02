// POI discovery via OpenStreetMap's Overpass API — no API key.
// Same data behind your map tiles, so suggestions line up with what's drawn.
// Usage policy: keep volume low (we only query on an explicit button press). For a
// public launch this would move behind an Edge Function with caching, like search.ts.
import type { DiscoveryProvider, DiscoveryResult } from './DiscoveryProvider'

// Food-ish amenities we treat as "places to eat".
const FOOD_AMENITIES = 'restaurant|cafe|fast_food|bar|pub|ice_cream|biergarten'

const ENDPOINT = 'https://overpass-api.de/api/interpreter'

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export const discoverViaOverpass: DiscoveryProvider = async (q, signal) => {
  const { south, west, north, east } = q.bounds
  const bbox = `${south},${west},${north},${east}`

  // Each selected diet adds an AND filter on the same element ("fits everyone").
  // diet:<x>=yes|only are the values that mean "we serve this".
  const dietFilters = q.diets.map((d) => `["diet:${d}"~"yes|only"]`).join('')

  // nwr = nodes + ways + relations; `out center` gives ways/relations a point.
  const ql =
    `[out:json][timeout:25];` +
    `nwr["amenity"~"^(${FOOD_AMENITIES})$"]["name"]${dietFilters}(${bbox});` +
    `out center ${q.limit ?? 50};`

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(ql),
    signal,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!res.ok) throw new Error(`Discovery failed (${res.status})`)

  const json: { elements?: OverpassElement[] } = await res.json()
  const seen = new Set<string>()
  const out: DiscoveryResult[] = []

  for (const el of json.elements ?? []) {
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
      kind: el.tags?.amenity ?? 'place',
      cuisine: el.tags?.cuisine?.replace(/[_;]/g, ' '),
    })
  }

  return out
}
