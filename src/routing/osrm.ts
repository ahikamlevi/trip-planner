import type { RouteLeg, RouteProvider, RouteRequest } from './RouteProvider'

// OSRM's free public demo server. No API key. Driving profile only (the demo
// server is car-routing). Light use only — we cache every result in route_cache
// so a given pair is fetched at most once.
const BASE = 'https://router.project-osrm.org/route/v1/driving'

export const osrmProvider: RouteProvider = {
  async getRoute({ origin, dest }: RouteRequest): Promise<RouteLeg | null> {
    const url = `${BASE}/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=false`
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const data: { routes?: Array<{ distance: number; duration: number }> } = await res.json()
      const route = data.routes?.[0]
      if (!route) return null
      return { distanceMeters: route.distance, durationSeconds: route.duration }
    } catch {
      return null
    }
  },
}
