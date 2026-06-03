// Foursquare-backed discovery via our Supabase Edge Function ('discover'), which
// holds the API key server-side. supabase.functions.invoke attaches the user's auth,
// so only signed-in users can call it.
import { supabase } from '../lib/supabase'
import type { DiscoveryProvider, DiscoveryResult } from './DiscoveryProvider'

export const discoverViaFoursquare: DiscoveryProvider = async (q) => {
  const { data, error } = await supabase.functions.invoke('discover', {
    body: { bounds: q.bounds, diets: q.diets, limit: q.limit ?? 40 },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return (data?.results ?? []) as DiscoveryResult[]
}
