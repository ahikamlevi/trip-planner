// Provider-agnostic "find places nearby" interface (POI discovery), mirroring the
// map/ and routing/ adapters. App code talks to this; only the concrete provider
// (overpass.ts today) knows the data source. Billable providers (Google/Foursquare)
// would later move behind a Supabase Edge Function so the key stays server-side.
import type { MapBounds } from '../map'

// OSM diet:* tags we can filter on (these are the queryable ones).
export type DietFilter = 'vegan' | 'vegetarian' | 'gluten_free' | 'kosher' | 'halal'

export const DIET_FILTERS: DietFilter[] = ['vegan', 'vegetarian', 'gluten_free', 'kosher', 'halal']

export interface DiscoveryResult {
  /** Stable id from the provider (used as a React key and de-dupe hint). */
  id: string
  name: string
  lat: number
  lng: number
  /** The amenity kind, e.g. 'restaurant' | 'cafe' | 'fast_food'. */
  kind: string
  /** Free-text cuisine tag, when present. */
  cuisine?: string
}

export interface DiscoveryQuery {
  /** Search inside this viewport box. */
  bounds: MapBounds
  /** All selected diets must match (logical AND) — "fits everyone". */
  diets: DietFilter[]
  /** Cap on results (provider may return fewer). */
  limit?: number
}

export type DiscoveryProvider = (
  q: DiscoveryQuery,
  signal?: AbortSignal,
) => Promise<DiscoveryResult[]>
