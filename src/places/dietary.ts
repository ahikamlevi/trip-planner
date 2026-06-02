// Shared dietary/allergy tags. Stored on profiles.dietary_restrictions (text[]).
// Labels live in the i18n dictionary under 'diet.tag.<tag>' (en + he).
//
// Two semantically different groups (don't merge them on the allergy card):
//   ALLERGEN_TAGS — things to AVOID ("cannot eat X").
//   DIET_TAGS     — a diet the person FOLLOWS ("eats only kosher/vegan").

export const ALLERGEN_TAGS = [
  'gluten',
  'nuts',
  'peanuts',
  'shellfish',
  'dairy',
  'eggs',
  'soy',
  'fish',
  'sesame',
] as const

export const DIET_TAGS = ['vegetarian', 'vegan', 'kosher', 'halal'] as const

export const DIETARY_TAGS = [...ALLERGEN_TAGS, ...DIET_TAGS] as const

export type AllergenTag = (typeof ALLERGEN_TAGS)[number]
export type DietTag = (typeof DIET_TAGS)[number]
export type DietaryTag = (typeof DIETARY_TAGS)[number]

const ALLERGEN_SET: ReadonlySet<string> = new Set(ALLERGEN_TAGS)

export const isAllergen = (tag: string): boolean => ALLERGEN_SET.has(tag)
