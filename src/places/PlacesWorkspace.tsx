import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useTripRealtime } from '../lib/useTripRealtime'
import { useT } from '../i18n/I18nProvider'
import type { Place, PlaceCategory } from '../lib/database.types'
import { MapView, type MapApi } from '../map/MapView'
import type { LatLng, MapMarker } from '../map/index'
import { CATEGORIES, categoryMeta, placeColor, PLACE_COLORS } from './categories'
import { searchPlaces, reverseCity, type SearchResult } from './search'
import { discoverPlaces, DIET_FILTERS, type DietFilter, type DiscoveryResult } from '../discovery'

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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
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
  const { session } = useAuth()
  const uid = session!.user.id
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState<LatLng | null>(null)
  const [dropMode, setDropMode] = useState(false)
  const [catFilter, setCatFilter] = useState<PlaceCategory | 'all'>('all')
  const [cityFilter, setCityFilter] = useState<string>('all')

  // --- Discovery (find places nearby via Overpass) ---
  const mapApiRef = useRef<MapApi | null>(null)
  const [diets, setDiets] = useState<DietFilter[]>([])
  const [discoveries, setDiscoveries] = useState<DiscoveryResult[]>([])
  const [discoBusy, setDiscoBusy] = useState(false)
  const [discoMsg, setDiscoMsg] = useState<string | null>(null)
  const [myRestrictions, setMyRestrictions] = useState<string[]>([])

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
    async (input: { name: string; lat: number; lng: number; category?: PlaceCategory; city?: string }) => {
      const { data, error } = await supabase
        .from('places')
        .insert({
          trip_id: tripId,
          name: input.name,
          lat: input.lat,
          lng: input.lng,
          category: input.category ?? 'sight',
          city: input.city ?? null,
          scheduled: false,
        })
        .select('*')
        .single()
      if (error) {
        setError(error.message)
        return
      }
      await load()
      if (data) {
        setSelectedId(data.id)
        setFocus({ lat: input.lat, lng: input.lng })
      }
    },
    [tripId, load],
  )

  const runDiscovery = useCallback(
    async (useDiets: DietFilter[]) => {
      const bounds = mapApiRef.current?.getBounds()
      if (!bounds) return
      setDiscoBusy(true)
      setDiscoMsg(null)
      try {
        const results = await discoverPlaces({ bounds, diets: useDiets, limit: 50 })
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
    setDiets(myDietFilters)
    void runDiscovery(myDietFilters)
  }

  async function addDiscovery(d: DiscoveryResult) {
    setDiscoveries((prev) => prev.filter((x) => x.id !== d.id))
    await addPlace({ name: d.name, lat: d.lat, lng: d.lng, category: 'food' })
  }

  const updatePlace = useCallback(
    async (id: string, patch: Partial<Place>) => {
      const { error } = await supabase.from('places').update(patch).eq('id', id)
      if (error) setError(error.message)
      else await load()
    },
    [load],
  )

  const deletePlace = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('places').delete().eq('id', id)
      if (error) setError(error.message)
      else {
        if (selectedId === id) setSelectedId(null)
        await load()
      }
    },
    [load, selectedId],
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
        popup: placePopupHtml(p, t(`cat.${p.category}`)),
      })),
    [located, selectedId, t],
  )

  const discoMarkers: MapMarker[] = useMemo(
    () =>
      discoveries.map((d) => ({
        id: 'disco:' + d.id,
        position: { lat: d.lat, lng: d.lng },
        category: 'food',
        color: SUGGESTION_COLOR,
        label: d.name,
        popup: `<div class="map-popup"><strong>${escapeHtml(d.name)}</strong><div>🌱 ${escapeHtml(
          d.cuisine || d.kind,
        )}${d.rating != null ? ' · ★ ' + d.rating : ''}</div>${
          d.address ? `<div>${escapeHtml(d.address)}</div>` : ''
        }</div>`,
      })),
    [discoveries],
  )

  const allMarkers = useMemo(() => [...markers, ...discoMarkers], [markers, discoMarkers])

  const center = located[0] ? { lat: located[0].lat as number, lng: located[0].lng as number } : DEFAULT_CENTER
  const selected = places?.find((p) => p.id === selectedId) ?? null

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
        <PlaceSearch onAdd={addPlace} />
      </div>

      <div className="discovery-bar">
        <span className="discovery-label small">{t('disco.find')}</span>
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
        <div className="discovery-actions">
          <button onClick={() => void runDiscovery(diets)} disabled={discoBusy}>
            {discoBusy ? t('disco.searching') : t('disco.searchArea')}
          </button>
          {myDietFilters.length > 0 && (
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

      <div className={`places-map-wrap${dropMode ? ' dropping' : ''}`}>
        <div className="map-toolbar">
          <button
            className={`secondary${dropMode ? ' active' : ''}`}
            onClick={() => setDropMode((d) => !d)}
          >
            {dropMode ? t('places.dropPinActive') : t('places.dropPin')}
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

      {discoveries.length > 0 && (
        <div className="discovery-results">
          <div className="wishlist-head">
            <span>{t('disco.results')}</span>
            <span className="muted">{discoveries.length}</span>
          </div>
          <ul className="place-list">
            {discoveries.map((d) => (
              <li key={d.id}>
                <div className="discovery-row">
                  <button
                    className="place-row"
                    onClick={() => setFocus({ lat: d.lat, lng: d.lng })}
                    title={t('disco.showOnMap')}
                  >
                    <span className="place-emoji">🌱</span>
                    <span className="place-row-name">{d.name}</span>
                    {d.rating != null && <span className="muted small disco-rating">★ {d.rating}</span>}
                    <span className="muted small">{d.cuisine || d.kind}</span>
                  </button>
                  <button className="secondary" onClick={() => void addDiscovery(d)}>
                    {t('disco.add')}
                  </button>
                </div>
              </li>
            ))}
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
                    <button
                      className={`place-row${p.id === selectedId ? ' active' : ''}`}
                      onClick={() => selectPlace(p.id)}
                      style={{ borderInlineStartColor: placeColor(p.category, p.color), borderInlineStartWidth: 3 }}
                    >
                      <span className="place-emoji" title={t(`cat.${p.category}`)}>{meta.emoji}</span>
                      <span className="place-row-name">{p.name}</span>
                      {p.city && <span className="muted small place-city">{p.city}</span>}
                      {p.est_cost != null && <span className="muted small">{p.est_cost}</span>}
                      {(p.lat == null || p.lng == null) && (
                        <span className="muted small">{t('places.noPin')}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          {selected && (
            <PlaceEditor
              key={selected.id}
              place={selected}
              onSave={(patch) => updatePlace(selected.id, patch)}
              onDelete={() => deletePlace(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          )}
      </div>
    </section>
  )
}

function PlaceSearch({
  onAdd,
}: {
  onAdd: (input: { name: string; lat: number; lng: number; city?: string }) => void
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
                  onAdd({ name: r.name, lat: r.lat, lng: r.lng, city: r.city })
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

function PlaceEditor({
  place,
  onSave,
  onDelete,
  onClose,
}: {
  place: Place
  onSave: (patch: Partial<Place>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const { t } = useT()
  const [name, setName] = useState(place.name)
  const [category, setCategory] = useState<PlaceCategory>(place.category)
  const [notes, setNotes] = useState(place.notes ?? '')
  const [hours, setHours] = useState(place.opening_hours ?? '')
  const [dietary, setDietary] = useState(place.dietary_notes ?? '')
  const [cost, setCost] = useState(place.est_cost?.toString() ?? '')
  const [city, setCity] = useState(place.city ?? '')
  const [color, setColor] = useState<string | null>(place.color)

  return (
    <div className="place-editor">
      <div className="editor-head">
        <strong>{t('places.editPlace')}</strong>
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
              notes: notes.trim() || null,
              opening_hours: hours.trim() || null,
              dietary_notes: dietary.trim() || null,
              color,
              city: city.trim() || null,
              est_cost: cost.trim() === '' ? null : Number(cost),
            })
          }
        >
          {t('common.save')}
        </button>
        <button
          className="secondary danger"
          onClick={() => {
            if (confirm(t('places.confirmDelete', { name: place.name }))) onDelete()
          }}
        >
          {t('common.delete')}
        </button>
      </div>
    </div>
  )
}
