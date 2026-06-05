// Parse a pasted Google/Apple Maps link (or raw coordinates) into a place we can drop
// a pin for. The inbound counterpart to the "Maps ↗" out-links. Pure + synchronous so
// it's trivially testable and runs entirely in the browser — EXCEPT short links
// (maps.app.goo.gl / goo.gl/maps), which carry no coordinates and are an opaque
// cross-origin redirect the browser can't follow; those return { kind: 'needs-resolver' }
// for a future server-side `resolve-place` Edge Function to expand.

export type ParsedMapsLink =
  | { kind: 'place'; lat: number; lng: number; name?: string }
  | { kind: 'needs-resolver'; url: string }
  | { kind: 'unrecognized' }

// "lat,lng" → validated coords (or null). Shared by every format below.
function parseLatLng(s: string | null | undefined): { lat: number; lng: number } | null {
  if (!s) return null
  const m = s.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

// "Eiffel+Tower" / "Eiffel%20Tower" path or query segment → "Eiffel Tower".
function decodeName(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  try {
    const s = decodeURIComponent(raw.replace(/\+/g, ' ')).trim()
    // A name that's actually a coordinate pair isn't a useful label.
    return s && !parseLatLng(s) ? s : undefined
  } catch {
    return undefined
  }
}

// Google short links (the mobile "Share → Copy link" default) carry no coordinates and
// must be expanded server-side. (maps.app.goo.gl is itself under goo.gl, but match both.)
const isShortHost = (host: string) => /(^|\.)goo\.gl$/i.test(host) || /(^|\.)maps\.app\.goo\.gl$/i.test(host)

export function parseMapsLink(input: string): ParsedMapsLink {
  const text = input.trim()
  if (!text) return { kind: 'unrecognized' }

  // 1. Raw "lat, lng" pasted directly.
  const raw = parseLatLng(text)
  if (raw) return { kind: 'place', ...raw }

  // 2. geo: URI (Android) — geo:lat,lng or the common geo:0,0?q=lat,lng(Label) form,
  // where the leading coords are a placeholder and the real ones live in q=.
  const geo = text.match(/^geo:(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i)
  if (geo) {
    const qRaw = text.match(/[?&]q=([^&]*)/i)?.[1] ?? null // still URL-encoded
    const qCoords = qRaw ? parseLatLng(decodeURIComponent(qRaw).split('(')[0]) : null
    const coords = qCoords ?? parseLatLng(`${geo[1]},${geo[2]}`)
    if (coords) {
      const label = text.match(/\(([^)]+)\)/)?.[1] ?? qRaw
      return { kind: 'place', ...coords, name: decodeName(label) }
    }
  }

  // 3. Full URL — Google / Apple / generic.
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { kind: 'unrecognized' }
  }
  const host = url.hostname.toLowerCase()

  // Short links carry no coordinates — defer to the server-side resolver.
  if (isShortHost(host)) return { kind: 'needs-resolver', url: url.href }

  const path = url.pathname
  const params = url.searchParams

  // Name: Google "/place/<Name>/" wins; else a non-coordinate q/query param.
  const placeSeg = path.match(/\/place\/([^/@]+)/)?.[1]
  const name =
    decodeName(placeSeg) ??
    decodeName(params.get('q')) ??
    decodeName(params.get('query')) ??
    decodeName(params.get('name'))

  // Coordinates, best source first:
  // - Google data block "!3d<lat>!4d<lng>" is the real marker (vs the "@" viewport).
  // - "@lat,lng,zoom" is the map center.
  // - Apple "ll"/"sll", or a q/query/coordinate param holding "lat,lng".
  const marker = path.match(/!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/)
  const at = path.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/)
  const coords =
    (marker && parseLatLng(`${marker[1]},${marker[2]}`)) ||
    (at && parseLatLng(`${at[1]},${at[2]}`)) ||
    parseLatLng(params.get('ll')) ||
    parseLatLng(params.get('sll')) ||
    parseLatLng(params.get('coordinate')) ||
    parseLatLng(params.get('q')) ||
    parseLatLng(params.get('query')) ||
    parseLatLng(params.get('daddr'))

  if (coords) return { kind: 'place', ...coords, name }

  // A recognised maps host but no coordinates (e.g. Apple "?address=") — let the
  // resolver try if it's a short host; otherwise we genuinely can't read it.
  return { kind: 'unrecognized' }
}

// True if the text looks like a maps link at all (used only to tailor the error
// message — a generic "couldn't read that" for non-links vs. a maps-specific hint).
export function looksLikeMapsLink(input: string): boolean {
  const text = input.trim()
  if (/^geo:/i.test(text)) return true
  try {
    new URL(text)
    return /goo\.gl|google\.|\/maps|apple\.com/i.test(text)
  } catch {
    return false
  }
}
