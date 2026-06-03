// Provider-agnostic "find places nearby" interface (POI discovery), mirroring the
// map/ and routing/ adapters. App code talks to this; only the concrete provider
// (overpass.ts today) knows the data source. Billable providers (Google/Foursquare)
// would later move behind a Supabase Edge Function so the key stays server-side.
import type { MapBounds } from '../map'
import type { PlaceCategory } from '../lib/database.types'

// OSM diet:* tags we can filter on (these are the queryable ones).
export type DietFilter = 'vegan' | 'vegetarian' | 'gluten_free' | 'kosher' | 'halal'

export const DIET_FILTERS: DietFilter[] = ['vegan', 'vegetarian', 'gluten_free', 'kosher', 'halal']

// A "what to find" category. Only the 'food' category exposes diet sub-filters.
export interface DiscoCategory {
  /** Stable key + i18n key ('disco.cat.<key>'). */
  key: string
  /** Emoji shown on the chip. */
  icon: string
  /** App place category assigned to a place added from this search. */
  placeCategory: PlaceCategory
  /** Foursquare free-text search term. */
  fsqQuery: string
  /** Overpass selector chain (after ["name"]), for the OSM fallback. */
  osm: string
}

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
  /** Provider rating (Foursquare: 0–10), when available. */
  rating?: number | null
  /** Price tier 1–4 ($–$$$$), when available. */
  price?: number | null
  /** Phone number, when available. */
  tel?: string | null
  /** Website URL, when available. */
  website?: string | null
  /** Full opening-hours schedule, e.g. "Mon–Fri 9:00–17:00", when available. */
  hours?: string | null
  /** Whether the place is open right now, when known (less useful for planning). */
  openNow?: boolean | null
  /** Short description, when available. */
  description?: string | null
  /** City / locality, when available. */
  city?: string | null
  /** Human-readable address, when available. */
  address?: string | null
  /** App place category to use if this result is added (from the search category). */
  placeCategory?: PlaceCategory
}

export interface DiscoveryQuery {
  /** Search inside this viewport box. */
  bounds: MapBounds
  /** What kind of place to find. */
  category: DiscoCategory
  /** Diet sub-filters (only meaningful for the 'food' category). */
  diets: DietFilter[]
  /** Cap on results (provider may return fewer). */
  limit?: number
}

export type DiscoveryProvider = (
  q: DiscoveryQuery,
  signal?: AbortSignal,
) => Promise<DiscoveryResult[]>
