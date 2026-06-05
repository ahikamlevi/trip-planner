import type { LatLng, RouteLeg, RouteProvider, RouteRequest } from './RouteProvider'

// Stadia Maps routing (Valhalla under the hood), used when VITE_STADIA_API_KEY is set
// — production-licensed and supports multiple travel modes, vs. the OSRM demo server's
// driving-only profile. Same RouteProvider contract; ./index falls back to OSRM when no
// key is present. Results are cached by ./index (route_cache + the in-memory path memo).
//
// Endpoint: POST https://api.stadiamaps.com/route/v1?api_key=KEY (Valhalla `route`).
// Distance comes back in the requested `units` (we ask for kilometers → ×1000 = meters);
// time is seconds. Leg `shape` is an encoded polyline with 6 digits of precision (the
// Valhalla default — note: NOT Google's 5).
const BASE = 'https://api.stadiamaps.com/route/v1'
const KEY = import.meta.env.VITE_STADIA_API_KEY

// Map our internal modes onto Valhalla costing profiles (defaults to driving).
function costing(mode?: string): string {
  switch (mode) {
    case 'walk':
    case 'walking':
    case 'foot':
    case 'pedestrian':
      return 'pedestrian'
    case 'bike':
    case 'bicycle':
    case 'cycling':
      return 'bicycle'
    case 'bus':
      return 'bus'
    default:
      return 'auto'
  }
}

interface ValhallaLeg {
  shape?: string
  summary?: { length?: number; time?: number }
}
interface ValhallaResponse {
  trip?: {
    legs?: ValhallaLeg[]
    summary?: { length?: number; time?: number }
  }
}

async function route(locations: LatLng[], mode?: string, signal?: AbortSignal): Promise<ValhallaResponse | null> {
  const body = {
    locations: locations.map((p) => ({ lat: p.lat, lon: p.lng, type: 'break' as const })),
    costing: costing(mode),
    units: 'kilometers' as const,
  }
  try {
    const res = await fetch(`${BASE}?api_key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) return null
    return (await res.json()) as ValhallaResponse
  } catch {
    return null
  }
}

// Decode a Valhalla-encoded polyline (precision 6) into lat/lng points.
function decodePolyline6(encoded: string): LatLng[] {
  const points: LatLng[] = []
  let index = 0
  let lat = 0
  let lng = 0
  const len = encoded.length
  while (index < len) {
    let result = 0
    let shift = 0
    let b: number
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    result = 0
    shift = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    points.push({ lat: lat / 1e6, lng: lng / 1e6 })
  }
  return points
}

export const stadiaProvider: RouteProvider = {
  async getRoute({ origin, dest, mode }: RouteRequest): Promise<RouteLeg | null> {
    const data = await route([origin, dest], mode)
    const summary = data?.trip?.summary
    if (!summary || summary.length == null || summary.time == null) return null
    return { distanceMeters: summary.length * 1000, durationSeconds: summary.time }
  },

  async getRoutePath(points: LatLng[]): Promise<LatLng[] | null> {
    if (points.length < 2) return null
    const data = await route(points)
    const legs = data?.trip?.legs
    if (!legs?.length) return null
    // Concatenate each leg's decoded shape; the first point of each leg after the first
    // repeats the previous leg's last point, so drop it to avoid duplicate vertices.
    const path: LatLng[] = []
    for (const leg of legs) {
      if (!leg.shape) continue
      const decoded = decodePolyline6(leg.shape)
      path.push(...(path.length ? decoded.slice(1) : decoded))
    }
    return path.length ? path : null
  },
}
