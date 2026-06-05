// Geocoding / place search. Uses Stadia Maps (Pelias-based) when VITE_STADIA_API_KEY
// is set — its autocomplete finds POIs/addresses far better than raw Nominatim and is
// production-licensed — and falls back to the free public OSM Nominatim otherwise.

const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY

export interface SearchResult {
  name: string
  detail: string
  lat: number
  lng: number
  city?: string
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 3) return []
  return STADIA_KEY ? searchStadia(q, signal) : searchNominatim(q, signal)
}

// Reverse-geocode a dropped pin to a city name (best effort; returns undefined on
// failure so a place can still be created without one).
export async function reverseCity(lat: number, lng: number, signal?: AbortSignal): Promise<string | undefined> {
  return STADIA_KEY ? reverseStadia(lat, lng, signal) : reverseNominatim(lat, lng, signal)
}

// --- Stadia Maps (Pelias) ------------------------------------------------------
// deno-lint-ignore no-explicit-any
interface PeliasProps {
  name?: string
  label?: string
  locality?: string
  localadmin?: string
  county?: string
  region?: string
  country?: string
}
interface PeliasFeature {
  geometry?: { coordinates?: [number, number] } // [lng, lat]
  properties?: PeliasProps
}

const peliasCity = (p?: PeliasProps): string | undefined =>
  p?.locality || p?.localadmin || p?.county || p?.region || undefined

// "Eiffel Tower, Paris, France" with name "Eiffel Tower" → "Paris, France".
function peliasDetail(p: PeliasProps): string {
  const label = p.label ?? ''
  const name = p.name ?? ''
  if (label && name && label.startsWith(name)) return label.slice(name.length).replace(/^[,\s]+/, '')
  return label || [p.locality, p.region, p.country].filter(Boolean).join(', ')
}

async function searchStadia(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const url =
    `https://api.stadiamaps.com/geocoding/v1/autocomplete?size=8&text=${encodeURIComponent(q)}` +
    `&api_key=${STADIA_KEY}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data: { features?: PeliasFeature[] } = await res.json()
  return (data.features ?? [])
    .map((f): SearchResult | null => {
      const c = f.geometry?.coordinates
      const p = f.properties ?? {}
      if (!c || !p.name) return null
      return { name: p.name, detail: peliasDetail(p), lat: c[1], lng: c[0], city: peliasCity(p) }
    })
    .filter((r): r is SearchResult => r !== null)
}

async function reverseStadia(lat: number, lng: number, signal?: AbortSignal): Promise<string | undefined> {
  try {
    const url =
      `https://api.stadiamaps.com/geocoding/v1/reverse?size=1&point.lat=${lat}&point.lon=${lng}` +
      `&api_key=${STADIA_KEY}`
    const res = await fetch(url, { signal })
    if (!res.ok) return undefined
    const data: { features?: PeliasFeature[] } = await res.json()
    return peliasCity(data.features?.[0]?.properties)
  } catch {
    return undefined
  }
}

// --- Nominatim (free OSM fallback) ---------------------------------------------
interface NominatimAddress {
  city?: string
  town?: string
  village?: string
  municipality?: string
  suburb?: string
  county?: string
  state?: string
}

const nominatimCity = (a?: NominatimAddress): string | undefined =>
  a?.city || a?.town || a?.village || a?.municipality || a?.suburb || a?.county

async function searchNominatim(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&q=' +
    encodeURIComponent(q)
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data: Array<{ display_name: string; lat: string; lon: string; name?: string; address?: NominatimAddress }> =
    await res.json()
  return data.map((d) => {
    const parts = d.display_name.split(',')
    return {
      name: d.name?.trim() || parts[0].trim(),
      detail: parts.slice(1).join(',').trim(),
      lat: Number(d.lat),
      lng: Number(d.lon),
      city: nominatimCity(d.address),
    }
  })
}

async function reverseNominatim(lat: number, lng: number, signal?: AbortSignal): Promise<string | undefined> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${lat}&lon=${lng}`
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return undefined
    const data: { address?: NominatimAddress } = await res.json()
    return nominatimCity(data.address)
  } catch {
    return undefined
  }
}
