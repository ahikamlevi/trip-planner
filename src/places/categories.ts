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

// Optional per-place color labels (Google-Calendar style). When a place has no
// color, we fall back to its category color so pins/cards still read at a glance.
export const PLACE_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#a855f7', // purple
  '#ec4899', // pink
  '#64748b', // slate
] as const

export function placeColor(category: PlaceCategory, color?: string | null): string {
  return color || categoryMeta(category).color
}
