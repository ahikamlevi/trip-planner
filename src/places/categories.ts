import type { PlaceCategory } from '../lib/database.types'

export interface CategoryMeta {
  key: PlaceCategory
  label: string
  color: string
  emoji: string
}

// Single source of truth for category styling, shared by the map markers and
// the UI so colors never drift apart.
export const CATEGORIES: CategoryMeta[] = [
  { key: 'food', label: 'Food', color: '#f97316', emoji: '🍜' },
  { key: 'sight', label: 'Attraction', color: '#3b82f6', emoji: '🎡' },
  { key: 'beach', label: 'Beach', color: '#06b6d4', emoji: '🏖️' },
  { key: 'hotel', label: 'Hotel', color: '#a855f7', emoji: '🏨' },
  { key: 'transport', label: 'Transport', color: '#84cc16', emoji: '🚆' },
]

export function categoryMeta(key: PlaceCategory): CategoryMeta {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[1]
}
