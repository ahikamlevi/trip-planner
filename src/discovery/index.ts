// The one place that picks the active discovery provider. Swap this line to change
// providers app-wide (e.g. a future Foursquare/Google adapter) — nothing else changes.
import { discoverViaOverpass } from './overpass'
import type { DiscoveryProvider } from './DiscoveryProvider'

export const discoverPlaces: DiscoveryProvider = discoverViaOverpass
export type { DiscoveryQuery, DiscoveryResult, DietFilter } from './DiscoveryProvider'
export { DIET_FILTERS } from './DiscoveryProvider'
