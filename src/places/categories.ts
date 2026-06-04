import type { PlaceCategory } from '../lib/database.types'

export interface CategoryMeta {
  key: PlaceCategory
  label: string
  color: string
  emoji: string
}

// Single source of truth for category styling, shared by the map markers and
// the UI so colors never drift apart. Mirrors the discovery categories so a
// place can be tagged with the same richness as a search. 'other' is a free-text
// catch-all (the label comes from places.category_other).
export const CATEGORIES: CategoryMeta[] = [
  { key: 'food', label: 'Food', color: '#f97316', emoji: '🍜' },
  { key: 'cafe', label: 'Café', color: '#b45309', emoji: '☕' },
  { key: 'bar', label: 'Bar', color: '#be123c', emoji: '🍷' },
  { key: 'sight', label: 'Attraction', color: '#3b82f6', emoji: '🎡' },
  { key: 'museum', label: 'Museum', color: '#8b5cf6', emoji: '🏛️' },
  { key: 'outdoors', label: 'Outdoors', color: '#16a34a', emoji: '🏞️' },
  { key: 'beach', label: 'Beach', color: '#06b6d4', emoji: '🏖️' },
  { key: 'hotel', label: 'Hotel', color: '#a855f7', emoji: '🏨' },
  { key: 'shopping', label: 'Shopping', color: '#ec4899', emoji: '🛍️' },
  { key: 'transport', label: 'Transport', color: '#84cc16', emoji: '🚆' },
  { key: 'pharmacy', label: 'Pharmacy', color: '#10b981', emoji: '💊' },
  { key: 'hospital', label: 'Hospital', color: '#ef4444', emoji: '🏥' },
  { key: 'police', label: 'Police', color: '#1d4ed8', emoji: '🚓' },
  { key: 'other', label: 'Other', color: '#64748b', emoji: '📍' },
]

export function categoryMeta(key: PlaceCategory): CategoryMeta {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES.find((c) => c.key === 'sight') ?? CATEGORIES[0]
}

// Display label for a place's category — the free-text value for 'other',
// otherwise the translated category name supplied by the caller.
export function categoryLabel(
  category: PlaceCategory,
  categoryOther: string | null | undefined,
  translated: string,
): string {
  if (category === 'other' && categoryOther?.trim()) return categoryOther.trim()
  return translated
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
