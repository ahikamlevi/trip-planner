// Free geocoding/search via OpenStreetMap's Nominatim — no API key.
// Usage policy: low volume, max ~1 req/sec (we debounce in the UI). For a public
// launch (Stage 7) this would move behind an Edge Function with caching, same as
// the billable providers.

export interface SearchResult {
  name: string
  detail: string
  lat: number
  lng: number
  city?: string
}

interface NominatimAddress {
  city?: string
  town?: string
  village?: string
  municipality?: string
  suburb?: string
  county?: string
  state?: string
}

// Best-effort "city" from a Nominatim address object (falls back through the
// usual locality fields). Returns undefined when nothing sensible is present.
function cityFromAddress(a?: NominatimAddress): string | undefined {
  return a?.city || a?.town || a?.village || a?.municipality || a?.suburb || a?.county
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 3) return []

  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&q=' +
    encodeURIComponent(q)

  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)

  const data: Array<{
    display_name: string
    lat: string
    lon: string
    name?: string
    address?: NominatimAddress
  }> = await res.json()

  return data.map((d) => {
    const parts = d.display_name.split(',')
    return {
      name: d.name?.trim() || parts[0].trim(),
      detail: parts.slice(1).join(',').trim(),
      lat: Number(d.lat),
      lng: Number(d.lon),
      city: cityFromAddress(d.address),
    }
  })
}

// Reverse-geocode a dropped pin to a city name (best effort; returns undefined on
// failure so a place can still be created without one).
export async function reverseCity(lat: number, lng: number, signal?: AbortSignal): Promise<string | undefined> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${lat}&lon=${lng}`
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return undefined
    const data: { address?: NominatimAddress } = await res.json()
    return cityFromAddress(data.address)
  } catch {
    return undefined
  }
}
