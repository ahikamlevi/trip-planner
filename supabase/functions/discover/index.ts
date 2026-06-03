// Supabase Edge Function: POI discovery via the Foursquare Places API.
// The API key stays server-side (set as the FOURSQUARE_API_KEY secret). The client
// calls this with supabase.functions.invoke('discover', { body }) — JWT-verified, so
// only signed-in users can reach it.
//
// Deploy:   supabase functions deploy discover
// Secret:   supabase secrets set FOURSQUARE_API_KEY=xxxxx
//           (or Dashboard → Edge Functions → Manage secrets)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FSQ_KEY = Deno.env.get('FOURSQUARE_API_KEY')
const FSQ_URL = 'https://places-api.foursquare.com/places/search'
const API_VERSION = '2025-06-17'

// Shared POI cache (poi_cache table) to protect Foursquare quota on repeat searches.
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected into Edge Functions automatically.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const sb = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Snap a coordinate to ~1km so nearby viewports share a cache entry.
const snap = (n: number) => Math.round(n * 100) / 100

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Diet filter -> Foursquare search term (matched against names/categories/tastes).
const DIET_QUERY: Record<string, string> = {
  vegan: 'vegan',
  vegetarian: 'vegetarian',
  gluten_free: 'gluten free',
  kosher: 'kosher',
  halal: 'halal',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

// Foursquare's response shape has shifted across versions; parse defensively.
// deno-lint-ignore no-explicit-any
function normalize(p: any) {
  const lat = p.latitude ?? p.geocodes?.main?.latitude
  const lng = p.longitude ?? p.geocodes?.main?.longitude
  const name = p.name
  if (lat == null || lng == null || !name) return null
  const cat = Array.isArray(p.categories) ? p.categories[0] : undefined
  return {
    id: String(p.fsq_place_id ?? p.fsq_id ?? `${name}@${lat},${lng}`),
    name,
    lat,
    lng,
    kind: cat?.short_name ?? cat?.name ?? 'place',
    cuisine: cat?.name ?? undefined,
    rating: typeof p.rating === 'number' ? p.rating : null,
    price: typeof p.price === 'number' ? p.price : null,
    tel: p.tel ?? null,
    website: p.website ?? null,
    // Full schedule (e.g. "Mon-Fri 9:00-17:00") — useful for planning, unlike open_now.
    hours: p.hours?.display ?? null,
    openNow: p.hours?.open_now ?? null,
    description: p.description ?? null,
    city: p.location?.locality ?? p.location?.region ?? null,
    address: p.location?.formatted_address ?? null,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    if (!FSQ_KEY) return json({ error: 'FOURSQUARE_API_KEY is not set' }, 500)

    const { bounds, query: bodyQuery, diets = [], limit = 40 } = await req.json()
    if (!bounds) return json({ error: 'bounds is required' }, 400)

    const ne = `${bounds.north},${bounds.east}`
    const sw = `${bounds.south},${bounds.west}`
    // Prefer an explicit query (the client builds it from the chosen category +
    // diets); fall back to diet terms / 'restaurant' for older callers.
    const query =
      (typeof bodyQuery === 'string' && bodyQuery.trim()) ||
      (diets as string[]).map((d) => DIET_QUERY[d] ?? d).join(' ') ||
      'restaurant'
    const cap = Math.min(Number(limit) || 40, 50)

    // Cache lookup first — keyed by query + snapped viewport + result cap.
    const cacheKey = `${query}|${snap(bounds.south)},${snap(bounds.west)},${snap(bounds.north)},${snap(
      bounds.east,
    )}|${cap}`
    if (sb) {
      try {
        const { data: hit } = await sb
          .from('poi_cache')
          .select('results, fetched_at')
          .eq('cache_key', cacheKey)
          .maybeSingle()
        if (hit && Date.now() - new Date(hit.fetched_at).getTime() < CACHE_TTL_MS) {
          return json({ results: hit.results, cached: true })
        }
      } catch (_) {
        // Cache miss/error must never block a live search.
      }
    }

    const params = new URLSearchParams({
      ne,
      sw,
      query,
      limit: String(cap),
      fields: 'fsq_place_id,name,latitude,longitude,categories,location,rating,price,hours,tel,website,description',
    })

    let res = await fetch(`${FSQ_URL}?${params}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${FSQ_KEY}`,
        'X-Places-Api-Version': API_VERSION,
      },
    })

    // If the explicit `fields` set is rejected (field names differ by version),
    // retry once with provider defaults.
    if (res.status === 400) {
      params.delete('fields')
      res = await fetch(`${FSQ_URL}?${params}`, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${FSQ_KEY}`,
          'X-Places-Api-Version': API_VERSION,
        },
      })
    }

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300)
      return json({ error: `Foursquare ${res.status}`, detail }, 502)
    }

    const data = await res.json()
    const results = (data.results ?? data.places ?? [])
      .map(normalize)
      .filter((r: unknown) => r !== null)

    // Cache the fresh results for next time (best effort).
    if (sb) {
      try {
        await sb
          .from('poi_cache')
          .upsert({ cache_key: cacheKey, results, fetched_at: new Date().toISOString() })
      } catch (_) {
        // Never fail the request because caching failed.
      }
    }

    return json({ results })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
