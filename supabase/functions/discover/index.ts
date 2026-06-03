// Supabase Edge Function: POI discovery via the Foursquare Places API.
// The API key stays server-side (set as the FOURSQUARE_API_KEY secret). The client
// calls this with supabase.functions.invoke('discover', { body }) — JWT-verified, so
// only signed-in users can reach it.
//
// Deploy:   supabase functions deploy discover
// Secret:   supabase secrets set FOURSQUARE_API_KEY=xxxxx
//           (or Dashboard → Edge Functions → Manage secrets)

const FSQ_KEY = Deno.env.get('FOURSQUARE_API_KEY')
const FSQ_URL = 'https://places-api.foursquare.com/places/search'
const API_VERSION = '2025-06-17'

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
    city: p.location?.locality ?? p.location?.region ?? null,
    address: p.location?.formatted_address ?? null,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    if (!FSQ_KEY) return json({ error: 'FOURSQUARE_API_KEY is not set' }, 500)

    const { bounds, diets = [], limit = 40 } = await req.json()
    if (!bounds) return json({ error: 'bounds is required' }, 400)

    const ne = `${bounds.north},${bounds.east}`
    const sw = `${bounds.south},${bounds.west}`
    const query = (diets as string[]).map((d) => DIET_QUERY[d] ?? d).join(' ') || 'restaurant'

    const params = new URLSearchParams({
      ne,
      sw,
      query,
      limit: String(Math.min(Number(limit) || 40, 50)),
      fields: 'fsq_place_id,name,latitude,longitude,categories,location,rating',
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

    return json({ results })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
