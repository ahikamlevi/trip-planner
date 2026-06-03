// The active discovery provider. We prefer Foursquare (via the 'discover' Edge
// Function — richer data + ratings) and fall back to Overpass if it errors (e.g. the
// function isn't deployed yet, the API key isn't set, or Foursquare is down). This
// means the feature keeps working on OSM until the Foursquare setup is in place.
import { discoverViaFoursquare } from './foursquare'
import { discoverViaOverpass } from './overpass'
import type { DiscoveryProvider } from './DiscoveryProvider'

export const discoverPlaces: DiscoveryProvider = async (q, signal) => {
  try {
    return await discoverViaFoursquare(q, signal)
  } catch (err) {
    console.warn('[discovery] Foursquare unavailable, falling back to Overpass:', err)
    return discoverViaOverpass(q, signal)
  }
}

export type { DiscoveryQuery, DiscoveryResult, DietFilter, DiscoCategory } from './DiscoveryProvider'
export { DIET_FILTERS } from './DiscoveryProvider'
export { DISCO_CATEGORIES, DEFAULT_DISCO_CATEGORY, discoCategory } from './categories'
