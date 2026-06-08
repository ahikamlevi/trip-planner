// Trip "Route" — the welcoming home view. An ordered list of destinations (cities) with
// the travel leg into each, drawn on a map as the journey (Rio → Santiago → … → home).
// Destinations are stored in the `areas` table (promoted by migration 0025); because days
// link to an area, each destination owns its days, so "Plan days" drills into the planner.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTripRealtime } from '../lib/useTripRealtime'
import { useToast } from '../components/Toast'
import { useT } from '../i18n/I18nProvider'
import { searchPlaces } from '../places/search'
import { MapView } from '../map/MapView'
import type { LatLng, MapMarker } from '../map/index'
import { EmptyTip } from '../components/EmptyTip'
import type { Area } from '../lib/database.types'

const TRANSPORT_MODES = ['flight', 'train', 'bus', 'car', 'ferry', 'other'] as const

const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

// Great-circle interpolation between two points — the natural curved "flight arc" you see
// on travel maps. Not road-accurate (flights don't follow roads), but not a stark straight
// line either. Returns `segments + 1` points along the arc.
function arcBetween(a: LatLng, b: LatLng, segments: number): LatLng[] {
  const lat1 = toRad(a.lat)
  const lon1 = toRad(a.lng)
  const lat2 = toRad(b.lat)
  const lon2 = toRad(b.lng)
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(h))) // angular distance
  if (d < 1e-9) return [a, b]
  const pts: LatLng[] = []
  for (let i = 0; i <= segments; i++) {
    const f = i / segments
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    pts.push({ lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lng: toDeg(Math.atan2(y, x)) })
  }
  return pts
}

// Stitch the cities into one curved path (skip the duplicate join point between legs).
function routePath(cities: LatLng[]): LatLng[] {
  if (cities.length < 2) return cities
  const out: LatLng[] = []
  for (let i = 0; i < cities.length - 1; i++) {
    const seg = arcBetween(cities[i], cities[i + 1], 32)
    out.push(...(i > 0 ? seg.slice(1) : seg))
  }
  return out
}

// Add n days to an ISO date ('YYYY-MM-DD'), using local components so it never shifts a
// day across time zones (unlike toISOString, which converts to UTC).
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function RouteOverview({
  tripId,
  onPlanDestination,
}: {
  tripId: string
  onPlanDestination?: (dest: Area) => void
}) {
  const { t } = useT()
  const toast = useToast()
  const [dests, setDests] = useState<Area[] | null>(null)
  const [city, setCity] = useState('')
  const [adding, setAdding] = useState(false)
  const [fitBump, setFitBump] = useState(0)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('areas')
      .select('*')
      .eq('trip_id', tripId)
      .order('sort_order')
      .returns<Area[]>()
    setDests(data ?? [])
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])
  useTripRealtime(tripId, load)

  const list = dests ?? []
  const located = useMemo(() => list.filter((d) => d.lat != null && d.lng != null), [list])

  const markers: MapMarker[] = located.map((d, i) => ({
    id: d.id,
    position: { lat: d.lat!, lng: d.lng! },
    category: 'transport',
    label: d.name,
    badge: i + 1,
    color: 'var(--accent)',
  }))
  const path: LatLng[] = routePath(located.map((d) => ({ lat: d.lat!, lng: d.lng! })))
  const center: LatLng = located[0]
    ? { lat: located[0].lat!, lng: located[0].lng! }
    : { lat: 20, lng: 0 }

  async function addCity() {
    const name = city.trim()
    if (!name || adding) return
    setAdding(true)
    let lat: number | null = null
    let lng: number | null = null
    let label = name
    try {
      const results = await searchPlaces(name)
      if (results[0]) {
        lat = results[0].lat
        lng = results[0].lng
        label = results[0].name || name
      }
    } catch {
      /* geocoding failed — add the city without a map position */
    }
    const sortOrder = list.length ? Math.max(...list.map((d) => d.sort_order)) + 1 : 0
    // Default the new city's start to the day after the previous city's end (or start),
    // so a sequential route fills in fast.
    const prev = list[list.length - 1]
    const prevDate = prev?.end_date ?? prev?.start_date ?? null
    const startDate = prevDate ? addDays(prevDate, 1) : null
    const { error } = await supabase.from('areas').insert({
      trip_id: tripId,
      name: label,
      sort_order: sortOrder,
      lat,
      lng,
      start_date: startDate,
      transport_mode: list.length === 0 ? null : 'flight',
    })
    setAdding(false)
    if (error) {
      toast.error(t('common.saveFailed'))
      return
    }
    setCity('')
    if (lat == null) toast.info(t('route.notLocated'))
    else toast.success(t('route.added', { name: label }))
    void load()
  }

  async function patch(id: string, fields: Partial<Area>) {
    const { error } = await supabase.from('areas').update(fields).eq('id', id)
    if (error) toast.error(t('common.saveFailed'))
    else void load()
  }

  // Set a city's end date, and if the next city has no start yet, default it to the day
  // after — so dates flow down the route as you fill them in.
  async function setEnd(index: number, d: Area, value: string | null) {
    const next = list[index + 1]
    const ops = [supabase.from('areas').update({ end_date: value }).eq('id', d.id)]
    if (value && next && !next.start_date) {
      ops.push(supabase.from('areas').update({ start_date: addDays(value, 1) }).eq('id', next.id))
    }
    const results = await Promise.all(ops)
    if (results.some((r) => r.error)) toast.error(t('common.saveFailed'))
    else void load()
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= list.length) return
    // Reorder locally, then renumber the WHOLE list 0..n-1. Renumbering (vs swapping two
    // values) is robust even if existing rows share a sort_order — which they do for any
    // areas created before the Route feature, and was why reordering appeared stuck.
    const reordered = [...list]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    const results = await Promise.all(
      reordered.map((d, i) => supabase.from('areas').update({ sort_order: i }).eq('id', d.id)),
    )
    if (results.some((r) => r.error)) toast.error(t('common.saveFailed'))
    else void load()
  }

  async function remove(d: Area) {
    if (!confirm(t('route.removeConfirm', { name: d.name }))) return
    const { error } = await supabase.from('areas').delete().eq('id', d.id)
    if (error) toast.error(t('common.deleteFailed'))
    else void load()
  }

  return (
    <section className="route">
      <div className="section-head">
        <h2>{t('route.heading')}</h2>
      </div>
      <p className="muted">{t('route.intro')}</p>

      <div className="route-add">
        <input
          value={city}
          placeholder={t('route.addCity')}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void addCity()
            }
          }}
        />
        <button onClick={() => void addCity()} disabled={adding || !city.trim()}>
          {adding ? t('auth.saving') : t('common.add')}
        </button>
      </div>

      <div className="route-layout">
        <div className="route-list">
          {dests === null && <p className="muted small">{t('common.loading')}</p>}
          {dests !== null && list.length === 0 && (
            <EmptyTip emoji="🗺️" title={t('route.emptyTitle')} body={t('route.emptyBody')} />
          )}

          {list.map((d, i) => (
            <div key={d.id} className="route-dest card">
              <div className="route-dest-head">
                <span className="route-num" aria-hidden="true">
                  {i + 1}
                </span>
                <input
                  className="route-name"
                  defaultValue={d.name}
                  aria-label={t('route.addCity')}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== d.name) void patch(d.id, { name: v })
                  }}
                />
                <button
                  type="button"
                  className="linklike danger"
                  onClick={() => void remove(d)}
                  aria-label={t('common.remove')}
                  title={t('common.remove')}
                >
                  ×
                </button>
              </div>

              {i > 0 && (
                <label className="route-field">
                  <span className="muted small">{t('route.howYouArrive')}</span>
                  <select
                    value={d.transport_mode ?? 'flight'}
                    onChange={(e) => void patch(d.id, { transport_mode: e.target.value })}
                  >
                    {TRANSPORT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {t(`route.mode.${m}`)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="route-dates">
                <label className="route-date">
                  <span className="muted small">{t('route.arrive')}</span>
                  <input
                    type="date"
                    value={d.start_date ?? ''}
                    min={(list[i - 1]?.end_date ?? list[i - 1]?.start_date) || undefined}
                    onChange={(e) => void patch(d.id, { start_date: e.target.value || null })}
                  />
                </label>
                <label className="route-date">
                  <span className="muted small">{t('route.leave')}</span>
                  <input
                    type="date"
                    value={d.end_date ?? ''}
                    min={d.start_date ?? undefined}
                    onChange={(e) => void setEnd(i, d, e.target.value || null)}
                  />
                </label>
              </div>

              <div className="route-dest-actions">
                <span className="route-reorder">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void move(i, -1)}
                    disabled={i === 0}
                    aria-label={t('route.moveUp')}
                    title={t('route.moveUp')}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void move(i, 1)}
                    disabled={i === list.length - 1}
                    aria-label={t('route.moveDown')}
                    title={t('route.moveDown')}
                  >
                    ↓
                  </button>
                </span>
                {onPlanDestination && (
                  <button type="button" className="secondary" onClick={() => onPlanDestination(d)}>
                    {t('route.planDays')} →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="route-map-wrap">
          <button
            type="button"
            className="secondary route-fit"
            onClick={() => setFitBump((b) => b + 1)}
            disabled={located.length === 0}
          >
            🗺️ {t('route.fitMap')}
          </button>
          <MapView
            center={center}
            zoom={located.length ? 4 : 2}
            markers={markers}
            path={path}
            fitKey={`${located.length}-${fitBump}`}
          />
        </div>
      </div>
    </section>
  )
}
