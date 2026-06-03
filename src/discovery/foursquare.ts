// Foursquare-backed discovery via our Supabase Edge Function ('discover'), which
// holds the API key server-side. supabase.functions.invoke attaches the user's auth,
// so only signed-in users can call it.
import { supabase } from '../lib/supabase'
import type { DiscoveryProvider, DiscoveryResult, DietFilter } from './DiscoveryProvider'

// Diet filter -> Foursquare search term.
const DIET_TERM: Record<DietFilter, string> = {
  vegan: 'vegan',
  vegetarian: 'vegetarian',
  gluten_free: 'gluten free',
  kosher: 'kosher',
  halal: 'halal',
}

export const discoverViaFoursquare: DiscoveryProvider = async (q) => {
  // Food + diets → search the diet terms (implies restaurants); otherwise the
  // category's own search term (hotel, beach, museum…).
  const query =
    q.category.placeCategory === 'food' && q.diets.length
      ? q.diets.map((d) => DIET_TERM[d]).join(' ')
      : q.category.fsqQuery

  const { data, error } = await supabase.functions.invoke('discover', {
    body: { bounds: q.bounds, query, limit: q.limit ?? 40 },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  const results = (data?.results ?? []) as DiscoveryResult[]
  // Stamp the app category so an added place lands in the right bucket.
  return results.map((r) => ({ ...r, placeCategory: q.category.placeCategory }))
}
