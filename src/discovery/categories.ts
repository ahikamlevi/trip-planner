// The "what to find" categories for discovery. Only 'food' shows diet sub-filters.
// Each maps to a Foursquare search term, an Overpass selector (OSM fallback), and
// the app place-category a result gets when added.
import type { DiscoCategory } from './DiscoveryProvider'

// Trimmed to the categories worth a paid Foursquare call: food, hotels, and the
// useful-while-travelling services (pharmacy, hospital, police). Cafés/bars/attractions/
// museums/outdoors/beaches/shopping and the free-text "other" search were removed to cut
// discovery cost.
export const DISCO_CATEGORIES: DiscoCategory[] = [
  { key: 'food', icon: '🍜', placeCategory: 'food', fsqQuery: 'restaurant', osm: '["amenity"~"^(restaurant|fast_food|ice_cream)$"]' },
  { key: 'hotel', icon: '🏨', placeCategory: 'hotel', fsqQuery: 'hotel', osm: '["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"]' },
  // Services / useful-while-travelling.
  { key: 'pharmacy', icon: '💊', placeCategory: 'sight', fsqQuery: 'pharmacy', osm: '["amenity"="pharmacy"]' },
  { key: 'hospital', icon: '🏥', placeCategory: 'sight', fsqQuery: 'hospital', osm: '["amenity"~"^(hospital|clinic|doctors)$"]' },
  { key: 'police', icon: '🚓', placeCategory: 'sight', fsqQuery: 'police station', osm: '["amenity"="police"]' },
]

export const DEFAULT_DISCO_CATEGORY = DISCO_CATEGORIES[0]

export function discoCategory(key: string): DiscoCategory {
  return DISCO_CATEGORIES.find((c) => c.key === key) ?? DEFAULT_DISCO_CATEGORY
}
