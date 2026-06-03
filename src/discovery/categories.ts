// The "what to find" categories for discovery. Only 'food' shows diet sub-filters.
// Each maps to a Foursquare search term, an Overpass selector (OSM fallback), and
// the app place-category a result gets when added.
import type { DiscoCategory } from './DiscoveryProvider'

export const DISCO_CATEGORIES: DiscoCategory[] = [
  { key: 'food', icon: '🍜', placeCategory: 'food', fsqQuery: 'restaurant', osm: '["amenity"~"^(restaurant|fast_food|ice_cream)$"]' },
  { key: 'cafe', icon: '☕', placeCategory: 'food', fsqQuery: 'coffee', osm: '["amenity"="cafe"]' },
  { key: 'bar', icon: '🍷', placeCategory: 'food', fsqQuery: 'bar', osm: '["amenity"~"^(bar|pub|biergarten)$"]' },
  { key: 'attraction', icon: '🎡', placeCategory: 'sight', fsqQuery: 'tourist attraction', osm: '["tourism"~"^(attraction|theme_park|viewpoint|artwork|zoo)$"]' },
  { key: 'museum', icon: '🏛️', placeCategory: 'sight', fsqQuery: 'museum', osm: '["tourism"~"^(museum|gallery)$"]' },
  { key: 'outdoors', icon: '🏞️', placeCategory: 'sight', fsqQuery: 'park', osm: '["leisure"~"^(park|garden|nature_reserve)$"]' },
  { key: 'beach', icon: '🏖️', placeCategory: 'beach', fsqQuery: 'beach', osm: '["natural"="beach"]' },
  { key: 'hotel', icon: '🏨', placeCategory: 'hotel', fsqQuery: 'hotel', osm: '["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"]' },
  { key: 'shopping', icon: '🛍️', placeCategory: 'sight', fsqQuery: 'shopping', osm: '["shop"~"^(mall|department_store|supermarket|gift|clothes)$"]' },
  // Services / useful-while-travelling.
  { key: 'pharmacy', icon: '💊', placeCategory: 'sight', fsqQuery: 'pharmacy', osm: '["amenity"="pharmacy"]' },
  { key: 'hospital', icon: '🏥', placeCategory: 'sight', fsqQuery: 'hospital', osm: '["amenity"~"^(hospital|clinic|doctors)$"]' },
  { key: 'police', icon: '🚓', placeCategory: 'sight', fsqQuery: 'police station', osm: '["amenity"="police"]' },
  // Free text — type anything ("viewpoint", "atm", "laundry"). osm '' = name regex.
  { key: 'other', icon: '🔎', placeCategory: 'sight', fsqQuery: '', osm: '' },
]

export const DEFAULT_DISCO_CATEGORY = DISCO_CATEGORIES[0]

export function discoCategory(key: string): DiscoCategory {
  return DISCO_CATEGORIES.find((c) => c.key === key) ?? DEFAULT_DISCO_CATEGORY
}
