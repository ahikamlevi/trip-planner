// Pure helper: turn the ordered destinations into map pins, merging repeat visits to the
// same city into one pin that shows every stop number (e.g. "1·4"). Extracted so it can be
// unit-tested without the map/React. See markers.test.ts.

export interface RouteDestInput {
  name: string
  lat: number | null
  lng: number | null
}

export interface RouteMarkerData {
  lat: number
  lng: number
  name: string
  /** All route positions for this city, joined — e.g. "1·4" for a revisited city. */
  badge: string
}

export function buildRouteMarkers(dests: RouteDestInput[]): RouteMarkerData[] {
  const groups = new Map<
    string,
    { lat: number | null; lng: number | null; name: string; nums: number[] }
  >()
  dests.forEach((d, idx) => {
    const key = d.name.trim().toLowerCase()
    let g = groups.get(key)
    if (!g) {
      g = { lat: null, lng: null, name: d.name, nums: [] }
      groups.set(key, g)
    }
    g.nums.push(idx + 1)
    // Place the city's pin at the first visit that actually geocoded.
    if (g.lat == null && d.lat != null && d.lng != null) {
      g.lat = d.lat
      g.lng = d.lng
    }
  })
  return [...groups.values()]
    .filter((g) => g.lat != null && g.lng != null)
    .map((g) => ({ lat: g.lat as number, lng: g.lng as number, name: g.name, badge: g.nums.join('·') }))
}
