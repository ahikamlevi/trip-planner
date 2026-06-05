// The one place that picks the active routing provider + adds DB caching.
// Uses Stadia Maps (Valhalla) when VITE_STADIA_API_KEY is set — production-licensed,
// multi-mode — and falls back to the free public OSRM demo server otherwise, mirroring
// how tiles (src/map/tiles.ts) and geocoding (src/places/search.ts) pick their provider.
import { supabase } from '../lib/supabase'
import { osrmProvider } from './osrm'
import { stadiaProvider } from './stadia'
import type { LatLng, RouteLeg, RouteProvider } from './RouteProvider'

const provider: RouteProvider = import.meta.env.VITE_STADIA_API_KEY ? stadiaProvider : osrmProvider
const MODE = 'driving'

function coordKey(p: LatLng): string {
  // ~1m precision — close enough that the same stop pair always hits cache.
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
}

export function legKey(origin: LatLng, dest: LatLng): string {
  return `${coordKey(origin)}->${coordKey(dest)}`
}

// Returns a cached leg if present, else fetches from the provider and caches it.
export async function getRouteCached(origin: LatLng, dest: LatLng): Promise<RouteLeg | null> {
  const o = coordKey(origin)
  const d = coordKey(dest)

  const { data: cached } = await supabase
    .from('route_cache')
    .select('distance,duration')
    .eq('origin', o)
    .eq('dest', d)
    .eq('mode', MODE)
    .maybeSingle()

  if (cached && cached.distance != null && cached.duration != null) {
    return { distanceMeters: cached.distance, durationSeconds: cached.duration }
  }

  const leg = await provider.getRoute({ origin, dest, mode: MODE })
  if (leg) {
    await supabase
      .from('route_cache')
      .upsert(
        { origin: o, dest: d, mode: MODE, distance: leg.distanceMeters, duration: leg.durationSeconds },
        { onConflict: 'origin,dest,mode' },
      )
  }
  return leg
}

// In-memory cache of full-day road paths (keyed by the ordered coordinates).
// Multi-waypoint paths don't fit the per-pair route_cache table, so this is
// session-scoped only — cheap to refetch on a new load.
const pathMemo = new Map<string, LatLng[] | null>()

export async function getRoutePathCached(points: LatLng[]): Promise<LatLng[] | null> {
  if (points.length < 2 || !provider.getRoutePath) return null
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  const cached = pathMemo.get(key)
  if (cached !== undefined) return cached
  const path = await provider.getRoutePath(points)
  pathMemo.set(key, path)
  return path
}

export type { LatLng, RouteLeg } from './RouteProvider'
