// Free geocoding/search via OpenStreetMap's Nominatim — no API key.
// Usage policy: low volume, max ~1 req/sec (we debounce in the UI). For a public
// launch (Stage 7) this would move behind an Edge Function with caching, same as
// the billable providers.

export interface SearchResult {
  name: string
  detail: string
  lat: number
  lng: number
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 3) return []

  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=0&q=' +
    encodeURIComponent(q)

  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)

  const data: Array<{ display_name: string; lat: string; lon: string; name?: string }> =
    await res.json()

  return data.map((d) => {
    const parts = d.display_name.split(',')
    return {
      name: d.name?.trim() || parts[0].trim(),
      detail: parts.slice(1).join(',').trim(),
      lat: Number(d.lat),
      lng: Number(d.lon),
    }
  })
}
