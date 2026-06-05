import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useTripRealtime } from '../lib/useTripRealtime'
import { useToast } from '../components/Toast'
import { useT } from '../i18n/I18nProvider'
import type { Place, PlaceCategory } from '../lib/database.types'
import { MapView, type MapApi } from '../map/MapView'
import type { LatLng, MapMarker } from '../map/index'
import { CATEGORIES, categoryMeta, categoryLabel, placeColor, PLACE_COLORS } from './categories'
import { searchPlaces, reverseCity, type SearchResult } from './search'
import { parseMapsLink } from './mapsLink'
import {
  discoverPlaces,
  fetchPlaceDetails,
  DIET_FILTERS,
  DISCO_CATEGORIES,
  discoCategory,
  type DietFilter,
  type DiscoveryResult,
} from '../discovery'

// Profile restriction tags that map to a queryable OSM diet filter.
const RESTRICTION_TO_DIET: Record<string, DietFilter> = {
  vegan: 'vegan',
  vegetarian: 'vegetarian',
  kosher: 'kosher',
  halal: 'halal',
  gluten: 'gluten_free',
}

const SUGGESTION_COLOR = '#22c55e'

const DEFAULT_CENTER: LatLng = { lat: 20, lng: 0 }
const DEFAULT_ZOOM = 2

// Persist discovery state per trip so suggestions survive a tab switch / reload
// (the Map tab unmounts when you switch tabs). Session-scoped — cleared with the tab.
interface DiscoState {
  catKey: string
  diets: DietFilter[]
  discoveries: DiscoveryResult[]
}
const discoStoreKey = (tripId: string) => `disco:${tripId}`
function loadDiscoState(tripId: string): DiscoState | null {
  try {
    const raw = sessionStorage.getItem(discoStoreKey(tripId))
    return raw ? (JSON.parse(raw) as DiscoState) : null
  } catch {
    return null
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

// The places table has no columns for rating/price/phone/website, so fold the
// premium details we fetched (and paid Foursquare for) into the saved place's
// notes — editable afterwards in the place editor. Returns null if there's nothing.
function discoveryNote(d: DiscoveryResult): string | null {
  const lines: string[] = []
  const head: string[] = []
  if (d.rating != null) head.push(`★ ${d.rating}`)
  if (d.price != null && d.price > 0) head.push('$'.repeat(d.price))
  if (head.length) lines.push(head.join(' · '))
  if (d.tel) lines.push(`☎ ${d.tel}`)
  if (d.website) lines.push(`🔗 ${d.website}`)
  if (d.description) lines.push(d.description)
  return lines.length ? lines.join('\n') : null
}

function placePopupHtml(p: Place, catLabel: string): string {
  const meta = categoryMeta(p.category)
  const rows = [`<strong>${escapeHtml(p.name)}</strong>`, `<div>${meta.emoji} ${escapeHtml(catLabel)}</div>`]
  if (p.est_cost != null) rows.push(`<div>~${p.est_cost}</div>`)
  if (p.opening_hours) rows.push(`<div>🕑 ${escapeHtml(p.opening_hours)}</div>`)
  if (p.notes) rows.push(`<div>📝 ${escapeHtml(p.notes)}</div>`)
  return `<div class="map-popup">${rows.join('')}</div>`
}

export function PlacesWorkspace({ tripId }: { tripId: string }) {
  const { t } = useT()
  const toast = useToast()
  const { session } = useAuth()
  const uid = session!.user.id
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [focus, setFocus] = useState<LatLng | null>(null)
  // A searched-but-not-yet-saved candidate place (preview with an "Add" button).
  const [pending, setPending] = useState<{ name: string; lat: number; lng: number; city?: string } | null>(null)
  const [dropMode, setDropMode] = useState(false)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [catFilter, setCatFilter] = useState<PlaceCategory | 'all'>('all')
  const [cityFilter, setCityFilter] = useState<string>('all')

  // --- Discovery (find places nearby) ---
  const mapApiRef = useRef<MapApi | null>(null)
  const restored = useMemo(() => loadDiscoState(tripId), [tripId])
  const [catKey, setCatKey] = useState(restored?.catKey ?? 'food')
  const [diets, setDiets] = useState<DietFilter[]>(restored?.diets ?? [])
  const [freeText, setFreeText] = useState('')
  const isFood = discoCategory(catKey).placeCategory === 'food'
  const isOther = catKey === 'other'
  const [discoveries, setDiscoveries] = useState<DiscoveryResult[]>(restored?.discoveries ?? [])
  const [discoSelId, setDiscoSelId] = useState<string | null>(null)
  // Premium details are fetched only on explicit request (the "Details" button), one
  // cached Foursquare Premium call per place. These track which results have been
  // enriched (hide the button) and which are mid-fetch (show a spinner).
  const [enrichedIds, setEnrichedIds] = useState<Set<string>>(() => new Set())
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(() => new Set())
  const [discoBusy, setDiscoBusy] = useState(false)
  const [discoMsg, setDiscoMsg] = useState<string | null>(null)
  const [myRestrictions, setMyRestrictions] = useState<string[]>([])

  // Keep the persisted copy in sync so the suggestions survive tab switches.
  useEffect(() => {
    try {
      sessionStorage.setItem(discoStoreKey(tripId), JSON.stringify({ catKey, diets, discoveries }))
    } catch {
      /* ignore quota/serialization errors */
    }
  }, [tripId, catKey, diets, discoveries])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('dietary_restrictions')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => setMyRestrictions(data?.dietary_restrictions ?? []))
  }, [uid])

  const myDietFilters = useMemo(
    () => [...new Set(myRestrictions.map((r) => RESTRICTION_TO_DIET[r]).filter(Boolean) as DietFilter[])],
    [myRestrictions],
  )

  function toggleDiet(d: DietFilter) {
    setDiets((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setPlaces(data ?? [])
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  useTripRealtime(tripId, load)

  const addPlace = useCallback(
    async (input: {
      name: string
      lat: number
      lng: number
      category?: PlaceCategory
      category_other?: string | null
      city?: string
      opening_hours?: string | null
      notes?: string | null
      color?: string | null
      est_cost?: number | null
      dietary_notes?: string | null
      phone?: string | null
      select?: boolean
    }) => {
      const { data, error } = await supabase
        .from('places')
        .insert({
          trip_id: tripId,
          name: input.name,
          lat: input.lat,
          lng: input.lng,
          category: input.category ?? 'sight',
          category_other: input.category_other ?? null,
          city: input.city ?? null,
          opening_hours: input.opening_hours ?? null,
          notes: input.notes ?? null,
          color: input.color ?? null,
          est_cost: input.est_cost ?? null,
          dietary_notes: input.dietary_notes ?? null,
          phone: input.phone ?? null,
          scheduled: false,
        })
        .select('*')
        .single()
      if (error) {
        toast.error(t('common.saveFailed'))
        return
      }
      await load()
      if (data) {
        setSelectedId(data.id)
        // For a brand-new place (drop-a-pin) open the editor so it can be named.
        if (input.select !== false) setEditingId(data.id)
        setFocus({ lat: input.lat, lng: input.lng })
        toast.success(t('places.added', { name: input.name }))
      }
    },
    [tripId, load, toast, t],
  )

  const runDiscovery = useCallback(
    async (catK: string, useDiets: DietFilter[], freeVal = '') => {
      const bounds = mapApiRef.current?.getBounds()
      if (!bounds) return
      const category = discoCategory(catK)
      if (category.key === 'other' && !freeVal.trim()) return
      setDiscoBusy(true)
      setDiscoMsg(null)
      try {
        const results = await discoverPlaces({
          bounds,
          category,
          diets: category.placeCategory === 'food' ? useDiets : [],
          freeText: freeVal,
          limit: 25,
        })
        setEnrichedIds(new Set())
        setEnrichingIds(new Set())
        setDiscoveries(results)
        setDiscoMsg(results.length === 0 ? t('disco.none') : null)
      } catch {
        setDiscoMsg(t('disco.failed'))
      } finally {
        setDiscoBusy(false)
      }
    },
    [t],
  )

  function matchMyRestrictions() {
    setCatKey('food')
    setDiets(myDietFilters)
    void runDiscovery('food', myDietFilters, '')
  }

  // Selecting a search result only previews it (centers the map + opens the editor
  // with an Add button). It is NOT saved until the user clicks Add.
  function selectSearchResult(r: { name: string; lat: number; lng: number; city?: string }) {
    setSelectedId(null)
    setPending({ name: r.name, lat: r.lat, lng: r.lng, city: r.city })
    setFocus({ lat: r.lat, lng: r.lng })
  }

  async function addPending(patch: Partial<Place>) {
    if (!pending) return
    await addPlace({
      name: patch.name ?? pending.name,
      lat: pending.lat,
      lng: pending.lng,
      category: patch.category ?? 'sight',
      category_other: patch.category_other ?? null,
      city: (patch.city ?? pending.city) || undefined,
      opening_hours: patch.opening_hours ?? null,
      notes: patch.notes ?? null,
      color: patch.color ?? null,
      est_cost: patch.est_cost ?? null,
      dietary_notes: patch.dietary_notes ?? null,
      phone: patch.phone ?? null,
      select: false,
    })
    setPending(null)
  }

  // Fetch the premium fields (rating, hours, price, website…) for one place — only
  // when the user explicitly taps "Details". One cached Foursquare Premium call per
  // place. We mark the place "enriched" ONLY on success, so a transient failure can
  // be retried (don't pre-mark, or a failed fetch blocks the card forever).
  async function enrich(d: DiscoveryResult) {
    if (d.source !== 'fsq' || enrichedIds.has(d.id) || enrichingIds.has(d.id)) return
    setEnrichingIds((prev) => new Set(prev).add(d.id))
    const det = await fetchPlaceDetails(d.id)
    setEnrichingIds((prev) => {
      const next = new Set(prev)
      next.delete(d.id)
      return next
    })
    if (det) {
      setEnrichedIds((prev) => new Set(prev).add(d.id))
      setDiscoveries((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...det } : x)))
    }
  }

  async function addDiscovery(d: DiscoveryResult) {
    // Make sure we have the opening hours (and other details) before saving.
    let place = d
    if (d.source === 'fsq' && d.hours == null) {
      const det = await fetchPlaceDetails(d.id)
      if (det) place = { ...d, ...det }
    }
    setDiscoveries((prev) => prev.filter((x) => x.id !== d.id))
    await addPlace({
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      category: place.placeCategory ?? 'sight',
      city: place.city ?? undefined,
      opening_hours: place.hours ?? null,
      notes: discoveryNote(place),
      select: false,
    })
  }

  const updatePlace = useCallback(
    async (id: string, patch: Partial<Place>) => {
      const { error } = await supabase.from('places').update(patch).eq('id', id)
      if (error) toast.error(t('common.saveFailed'))
      else {
        await load()
        toast.success(t('common.saved'))
      }
    },
    [load, toast, t],
  )

  const deletePlace = useCallback(
    async (id: string) => {
      const name = places?.find((p) => p.id === id)?.name ?? ''
      const { error } = await supabase.from('places').delete().eq('id', id)
      if (error) toast.error(t('common.deleteFailed'))
      else {
        if (selectedId === id) setSelectedId(null)
        if (editingId === id) setEditingId(null)
        await load()
        toast.success(t('places.removed', { name }))
      }
    },
    [load, selectedId, editingId, places, toast, t],
  )

  const located = useMemo(
    () => (places ?? []).filter((p) => p.lat != null && p.lng != null),
    [places],
  )

  const markers: MapMarker[] = useMemo(
    () =>
      located.map((p) => ({
        id: p.id,
        position: { lat: p.lat as number, lng: p.lng as number },
        category: p.category,
        color: p.color ?? undefined,
        label: p.name,
        selected: p.id === selectedId,
        popup: placePopupHtml(p, categoryLabel(p.category, p.category_other, t(`cat.${p.category}`))),
      })),
    [located, selectedId, t],
  )

  const discoMarkers: MapMarker[] = useMemo(
    () =>
      discoveries.map((d) => {
        const emo = d.icon ?? categoryMeta(d.placeCategory ?? 'sight').emoji
        return {
          id: 'disco:' + d.id,
          position: { lat: d.lat, lng: d.lng },
          category: d.placeCategory ?? 'sight',
          color: SUGGESTION_COLOR,
          selected: d.id === discoSelId,
          label: d.name,
          popup: `<div class="map-popup"><strong>${escapeHtml(d.name)}</strong><div>${emo} ${escapeHtml(
            d.cuisine || d.kind,
          )}${d.rating != null ? ' · ★ ' + d.rating : ''}</div>${
            d.hours ? `<div>🕑 ${escapeHtml(d.hours)}</div>` : ''
          }${d.address ? `<div>${escapeHtml(d.address)}</div>` : ''}</div>`,
        }
      }),
    [discoveries, discoSelId],
  )

  const allMarkers = useMemo(() => {
    const pendingMarker: MapMarker[] = pending
      ? [
          {
            id: 'pending',
            position: { lat: pending.lat, lng: pending.lng },
            category: 'sight',
            color: '#3b82f6',
            selected: true,
            label: pending.name,
          },
        ]
      : []
    return [...markers, ...discoMarkers, ...pendingMarker]
  }, [markers, discoMarkers, pending])

  const center = located[0] ? { lat: located[0].lat as number, lng: located[0].lng as number } : DEFAULT_CENTER
  const editing = places?.find((p) => p.id === editingId) ?? null

  const cityOptions = useMemo(
    () =>
      [...new Set((places ?? []).map((p) => p.city).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [places],
  )
  const filtered = catFilter !== 'all' || cityFilter !== 'all'
  const filteredPlaces = useMemo(
    () =>
      (places ?? []).filter(
        (p) =>
          (catFilter === 'all' || p.category === catFilter) &&
          (cityFilter === 'all' || p.city === cityFilter),
      ),
    [places, catFilter, cityFilter],
  )

  function selectPlace(id: string) {
    setPending(null)
    setSelectedId(id)
    const p = places?.find((x) => x.id === id)
    if (p?.lat != null && p?.lng != null) setFocus({ lat: p.lat, lng: p.lng })
  }

  function handleMarkerClick(id: string) {
    if (id.startsWith('disco:')) {
      const d = discoveries.find((x) => 'disco:' + x.id === id)
      if (d) void addDiscovery(d)
      return
    }
    selectPlace(id)
  }

  return (
    <section className="card places-card">
      <h3>{t('places.title')}</h3>
      {error && <p className="auth-error">{error}</p>}

      <div className="places-top">
        <PlaceSearch onSelect={selectSearchResult} />
        <PasteMapsLink onSelect={selectSearchResult} />
      </div>

      <div className="discovery-bar">
        <span className="discovery-label small">{t('disco.find')}</span>
        <div className="cat-chips">
          {DISCO_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`cat-chip${catKey === c.key ? ' active' : ''}`}
              aria-pressed={catKey === c.key}
              onClick={() => setCatKey(c.key)}
            >
              {c.icon} {t(`disco.cat.${c.key}`)}
            </button>
          ))}
        </div>
        {isFood && (
          <div className="cat-chips diet-chips">
            {DIET_FILTERS.map((d) => (
              <button
                key={d}
                type="button"
                className={`cat-chip${diets.includes(d) ? ' active' : ''}`}
                aria-pressed={diets.includes(d)}
                onClick={() => toggleDiet(d)}
              >
                {t(`disco.diet.${d}`)}
              </button>
            ))}
          </div>
        )}
        {isOther && (
          <input
            className="disco-freetext"
            value={freeText}
            placeholder={t('disco.otherPlaceholder')}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runDiscovery(catKey, diets, freeText)
            }}
          />
        )}
        <div className="discovery-actions">
          <button
            onClick={() => void runDiscovery(catKey, diets, freeText)}
            disabled={discoBusy || (isOther && !freeText.trim())}
          >
            {discoBusy ? t('disco.searching') : t('disco.searchArea')}
          </button>
          {isFood && myDietFilters.length > 0 && (
            <button className="secondary" onClick={matchMyRestrictions} disabled={discoBusy}>
              {t('disco.matchMine')}
            </button>
          )}
          {discoveries.length > 0 && (
            <button className="linklike" onClick={() => setDiscoveries([])}>
              {t('disco.clear')}
            </button>
          )}
        </div>
      </div>
      {discoMsg && <p className="muted small">{discoMsg}</p>}

      <div className="places-layout">
      <div className={`places-map-wrap${dropMode ? ' dropping' : ''}${mapExpanded ? ' expanded' : ''}`}>
        <div className="map-toolbar">
          <button
            className={`secondary${dropMode ? ' active' : ''}`}
            onClick={() => setDropMode((d) => !d)}
          >
            {dropMode ? t('places.dropPinActive') : t('places.dropPin')}
          </button>
          <button
            className="secondary map-size-btn"
            onClick={() => setMapExpanded((v) => !v)}
            aria-pressed={mapExpanded}
            title={mapExpanded ? t('places.mapCompact') : t('places.mapExpand')}
          >
            {mapExpanded ? t('places.mapCompact') : t('places.mapExpand')}
          </button>
          <span className="muted small">
            {dropMode ? t('places.clickToPlace') : t('places.dropHint')}
          </span>
        </div>
        <MapView
          center={center}
          zoom={located.length ? 12 : DEFAULT_ZOOM}
          markers={allMarkers}
          focus={focus}
          onReady={(api) => (mapApiRef.current = api)}
          onMarkerClick={handleMarkerClick}
          onMapClick={
            dropMode
              ? (pos) => {
                  void (async () => {
                    const city = await reverseCity(pos.lat, pos.lng)
                    await addPlace({ name: t('places.newPlace'), lat: pos.lat, lng: pos.lng, city })
                  })()
                  setDropMode(false)
                }
              : undefined
          }
        />
      </div>

      <div className="places-lists">
      {discoveries.length > 0 && (
        <div className="discovery-results">
          <div className="wishlist-head">
            <span>{t('disco.results')}</span>
            <span className="muted">{discoveries.length}</span>
          </div>
          <ul className="place-list">
            {discoveries.map((d) => {
              // Search the name centered at its coordinates — works on web, Android,
              // and iPhone (combining name + "lat,lng" in one query finds nothing).
              const maps = `https://www.google.com/maps/search/${encodeURIComponent(d.name)}/@${d.lat},${d.lng},16z`
              const meta = d.cuisine || d.kind
              const enriched = enrichedIds.has(d.id)
              const loadingDetails = enrichingIds.has(d.id)
              const hasExtra =
                d.rating != null || !!d.hours || (d.price != null && d.price > 0) || !!d.website || !!d.description
              return (
                <li key={d.id}>
                  <div className="discovery-card">
                    <button
                      className="discovery-main"
                      onClick={() => {
                        setDiscoSelId(d.id)
                        setFocus({ lat: d.lat, lng: d.lng })
                      }}
                      title={t('disco.showOnMap')}
                    >
                      <span className="discovery-title">
                        <span className="place-emoji">{d.icon ?? categoryMeta(d.placeCategory ?? 'sight').emoji}</span>
                        <span className="place-row-name">{d.name}</span>
                        {d.rating != null && <span className="disco-rating">★ {d.rating}</span>}
                        {d.price != null && d.price > 0 && <span className="disco-price">{'$'.repeat(d.price)}</span>}
                      </span>
                      {meta && <span className="muted small">{meta}</span>}
                      {d.hours && <span className="muted small">🕑 {d.hours}</span>}
                      {d.description && <span className="muted small">{d.description}</span>}
                      {(d.address || d.city) && <span className="muted small">{d.address || d.city}</span>}
                    </button>
                    <div className="discovery-actions-row">
                      <button className="secondary" onClick={() => void addDiscovery(d)}>
                        {t('disco.add')}
                      </button>
                      {/* Premium details fetched only on explicit request (cost control). */}
                      {d.source === 'fsq' && !enriched && (
                        <button
                          className="secondary"
                          disabled={loadingDetails}
                          onClick={() => void enrich(d)}
                        >
                          {loadingDetails ? t('disco.loadingDetails') : t('disco.details')}
                        </button>
                      )}
                      {enriched && !hasExtra && <span className="muted small">{t('disco.noExtra')}</span>}
                      {d.website && (
                        <a className="disco-link" href={d.website} target="_blank" rel="noreferrer">
                          {t('disco.website')}
                        </a>
                      )}
                      <a className="disco-link" href={maps} target="_blank" rel="noreferrer">
                        {t('disco.maps')}
                      </a>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="places-detail">
          <div className="wishlist">
            <div className="wishlist-head">
              <span>{t('places.wishlist')}</span>
              <span className="muted">{filteredPlaces.length}{filtered ? ` / ${places?.length ?? 0}` : ''}</span>
            </div>

            {(places?.length ?? 0) > 0 && (
              <div className="place-filters">
                <select value={catFilter} onChange={(e) => setCatFilter(e.target.value as PlaceCategory | 'all')} aria-label={t('places.filterCategory')}>
                  <option value="all">{t('places.allCategories')}</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.emoji} {t(`cat.${c.key}`)}</option>
                  ))}
                </select>
                {cityOptions.length > 0 && (
                  <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} aria-label={t('places.filterCity')}>
                    <option value="all">{t('places.allCities')}</option>
                    {cityOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
                {filtered && (
                  <button className="linklike" onClick={() => { setCatFilter('all'); setCityFilter('all') }}>
                    {t('places.clearFilters')}
                  </button>
                )}
              </div>
            )}

            {places === null && <p className="muted">{t('common.loading')}</p>}
            {places !== null && places.length === 0 && (
              <p className="muted small">{t('places.emptyHint')}</p>
            )}
            {places !== null && places.length > 0 && filteredPlaces.length === 0 && (
              <p className="muted small">{t('places.noneMatch')}</p>
            )}
            <ul className="place-list">
              {filteredPlaces.map((p) => {
                const meta = categoryMeta(p.category)
                return (
                  <li key={p.id}>
                    <div
                      className={`place-row-wrap${p.id === selectedId ? ' active' : ''}`}
                      style={{ borderInlineStartColor: placeColor(p.category, p.color), borderInlineStartWidth: 3 }}
                    >
                      <button className="place-row" onClick={() => selectPlace(p.id)} title={t('disco.showOnMap')}>
                        <span className="place-emoji" title={categoryLabel(p.category, p.category_other, t(`cat.${p.category}`))}>{meta.emoji}</span>
                        <span className="place-row-name">{p.name}</span>
                        {p.category === 'other' && p.category_other && (
                          <span className="muted small place-cat-tag">{p.category_other}</span>
                        )}
                        {p.city && <span className="muted small place-city">{p.city}</span>}
                        {p.est_cost != null && <span className="muted small">{p.est_cost}</span>}
                        {(p.lat == null || p.lng == null) && (
                          <span className="muted small">{t('places.noPin')}</span>
                        )}
                      </button>
                      <button
                        className="place-edit-btn"
                        onClick={() => setEditingId(p.id)}
                        aria-label={t('common.edit')}
                        title={t('common.edit')}
                      >
                        ✏️
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
      </div>
      </div>
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditingId(null)}>
          <div className="modal place-editor-modal" onClick={(e) => e.stopPropagation()}>
            <PlaceEditor
              key={editing.id}
              place={editing}
              onSave={(patch) => {
                updatePlace(editing.id, patch)
                setEditingId(null)
              }}
              onDelete={() => deletePlace(editing.id)}
              onClose={() => setEditingId(null)}
            />
          </div>
        </div>
      )}

      {pending && (
        <div className="modal-overlay" onClick={() => setPending(null)}>
          <div className="modal place-editor-modal" onClick={(e) => e.stopPropagation()}>
            <PlaceEditor
              key="pending"
              isNew
              place={{
                id: '',
                trip_id: tripId,
                name: pending.name,
                lat: pending.lat,
                lng: pending.lng,
                category: 'sight',
                category_other: null,
                google_place_id: null,
                notes: null,
                opening_hours: null,
                dietary_notes: null,
                color: null,
                city: pending.city ?? null,
                est_cost: null,
                scheduled: false,
                is_reference: false,
                phone: null,
                created_at: '',
              }}
              onSave={addPending}
              onDelete={() => setPending(null)}
              onClose={() => setPending(null)}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function PlaceSearch({
  onSelect,
}: {
  onSelect: (input: { name: string; lat: number; lng: number; city?: string }) => void
}) {
  const { t } = useT()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setBusy(true)
      setErr(null)
      try {
        setResults(await searchPlaces(query, controller.signal))
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setErr(t('places.searchFailed'))
      } finally {
        setBusy(false)
      }
    }, 400)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, t])

  return (
    <div className="place-search">
      <input
        value={query}
        placeholder={t('places.search')}
        onChange={(e) => setQuery(e.target.value)}
      />
      {busy && <p className="muted small">{t('places.searching')}</p>}
      {err && <p className="auth-error small">{err}</p>}
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r, i) => (
            <li key={i}>
              <button
                onClick={() => {
                  onSelect({ name: r.name, lat: r.lat, lng: r.lng, city: r.city })
                  setQuery('')
                  setResults([])
                }}
              >
                <span className="result-name">{r.name}</span>
                <span className="muted small">{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Paste a Google/Apple Maps link (or raw coordinates) → drop a pin + open the editor
// prefilled, via the same `pending` flow a search result uses. Parsing is local; short
// links (maps.app.goo.gl) can't be expanded in the browser, so they show a hint for now
// (a server-side resolver is the planned phase 2).
function PasteMapsLink({
  onSelect,
}: {
  onSelect: (input: { name: string; lat: number; lng: number; city?: string }) => void
}) {
  const { t } = useT()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Parse a pasted value and (for short links) resolve it server-side, then add it.
  async function process(value: string) {
    if (busy) return
    const parsed = parseMapsLink(value)
    if (parsed.kind === 'unrecognized') return setErr(t('places.pasteLinkBad'))
    setErr(null)
    setBusy(true)
    try {
      let lat: number
      let lng: number
      let name: string | undefined
      if (parsed.kind === 'needs-resolver') {
        // Short link (maps.app.goo.gl) — expand it server-side (resolve-place fn).
        const { data, error } = await supabase.functions.invoke('resolve-place', {
          body: { url: parsed.url },
        })
        if (error || typeof data?.lat !== 'number' || typeof data?.lng !== 'number') {
          setErr(t('places.pasteLinkShort'))
          return
        }
        lat = data.lat
        lng = data.lng
        name = data.name ?? undefined
      } else {
        lat = parsed.lat
        lng = parsed.lng
        name = parsed.name
      }
      const city = await reverseCity(lat, lng)
      onSelect({ name: name ?? '', lat, lng, city })
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="paste-link">
      <div className="paste-link-row">
        <input
          value={text}
          placeholder={t('places.pasteLink')}
          onChange={(e) => {
            setText(e.target.value)
            if (err) setErr(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void process(text)
          }}
        />
        <button className="secondary" onClick={() => void process(text)} disabled={busy || !text.trim()}>
          {t('places.pasteLinkAdd')}
        </button>
      </div>
      {err ? (
        <p className="auth-error small">{err}</p>
      ) : (
        <p className="muted small">{t('places.pasteLinkHelp')}</p>
      )}
    </div>
  )
}

function PlaceEditor({
  place,
  onSave,
  onDelete,
  onClose,
  isNew = false,
}: {
  place: Place
  onSave: (patch: Partial<Place>) => void
  onDelete: () => void
  onClose: () => void
  isNew?: boolean
}) {
  const { t } = useT()
  const [name, setName] = useState(place.name)
  const [category, setCategory] = useState<PlaceCategory>(place.category)
  const [categoryOther, setCategoryOther] = useState(place.category_other ?? '')
  const [notes, setNotes] = useState(place.notes ?? '')
  const [hours, setHours] = useState(place.opening_hours ?? '')
  const [dietary, setDietary] = useState(place.dietary_notes ?? '')
  const [cost, setCost] = useState(place.est_cost?.toString() ?? '')
  const [city, setCity] = useState(place.city ?? '')
  const [color, setColor] = useState<string | null>(place.color)
  const [phone, setPhone] = useState(place.phone ?? '')

  return (
    <div className="place-editor">
      <div className="editor-head">
        <strong>{isNew ? t('places.addPlaceTitle') : t('places.editPlace')}</strong>
        <button className="linklike" onClick={onClose}>{t('common.close')}</button>
      </div>

      <label>
        {t('places.placeName')}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label>
        {t('places.category')}
        <div className="cat-chips">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`cat-chip${category === c.key ? ' active' : ''}`}
              style={category === c.key ? { borderColor: c.color, color: c.color } : undefined}
              onClick={() => setCategory(c.key)}
            >
              {c.emoji} {t(`cat.${c.key}`)}
            </button>
          ))}
        </div>
      </label>

      {category === 'other' && (
        <label>
          {t('places.categoryOther')}
          <input
            value={categoryOther}
            onChange={(e) => setCategoryOther(e.target.value)}
            placeholder={t('places.categoryOtherHint')}
          />
        </label>
      )}

      <label>
        {t('places.color')}
        <div className="color-swatches">
          <button
            type="button"
            className={`color-swatch none${color === null ? ' active' : ''}`}
            title={t('places.colorDefault')}
            aria-label={t('places.colorDefault')}
            onClick={() => setColor(null)}
          >
            ✕
          </button>
          {PLACE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch${color === c ? ' active' : ''}`}
              style={{ background: c }}
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </label>

      <label>
        {t('places.city')}
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('places.cityHint')} />
      </label>

      <label>
        {t('places.phone')}
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('places.phoneHint')}
        />
      </label>

      <div className="form-row">
        <label>
          {t('places.estCost')}
          <input
            type="number"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0"
          />
        </label>
        <label>
          {t('places.openingHours')}
          <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="9–17" />
        </label>
      </div>

      <label>
        {t('places.notes')}
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {category === 'food' && (
        <label>
          {t('places.dietaryNotes')}
          <input
            value={dietary}
            onChange={(e) => setDietary(e.target.value)}
            placeholder={t('places.dietaryNotesHint')}
          />
        </label>
      )}

      <div className="button-row">
        <button
          onClick={() =>
            onSave({
              name: name.trim() || t('places.newPlace'),
              category,
              category_other: category === 'other' ? categoryOther.trim() || null : null,
              notes: notes.trim() || null,
              opening_hours: hours.trim() || null,
              dietary_notes: dietary.trim() || null,
              color,
              city: city.trim() || null,
              est_cost: cost.trim() === '' ? null : Number(cost),
              phone: phone.trim() || null,
            })
          }
        >
          {isNew ? t('places.addToList') : t('common.save')}
        </button>
        {isNew ? (
          <button className="secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
        ) : (
          <button
            className="secondary danger"
            onClick={() => {
              if (confirm(t('places.confirmDelete', { name: place.name }))) onDelete()
            }}
          >
            {t('common.delete')}
          </button>
        )}
      </div>
    </div>
  )
}
