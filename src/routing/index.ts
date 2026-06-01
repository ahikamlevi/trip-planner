// The one place that picks the active routing provider + adds DB caching.
// Swap `provider` to change services app-wide.
import { supabase } from '../lib/supabase'
import { osrmProvider } from './osrm'
import type { LatLng, RouteLeg, RouteProvider } from './RouteProvider'

const provider: RouteProvider = osrmProvider
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

export type { LatLng, RouteLeg } from './RouteProvider'
