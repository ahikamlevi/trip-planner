import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Place, PlaceCategory } from '../lib/database.types'
import { MapView } from '../map/MapView'
import type { LatLng, MapMarker } from '../map/index'
import { CATEGORIES, categoryMeta } from './categories'
import { searchPlaces, type SearchResult } from './search'

const DEFAULT_CENTER: LatLng = { lat: 20, lng: 0 }
const DEFAULT_ZOOM = 2

export function PlacesWorkspace({ tripId }: { tripId: string }) {
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState<LatLng | null>(null)

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

  const addPlace = useCallback(
    async (input: { name: string; lat: number; lng: number; category?: PlaceCategory }) => {
      const { data, error } = await supabase
        .from('places')
        .insert({
          trip_id: tripId,
          name: input.name,
          lat: input.lat,
          lng: input.lng,
          category: input.category ?? 'sight',
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
        label: p.name,
        selected: p.id === selectedId,
      })),
    [located, selectedId],
  )

  const center = located[0] ? { lat: located[0].lat as number, lng: located[0].lng as number } : DEFAULT_CENTER
  const selected = places?.find((p) => p.id === selectedId) ?? null

  function selectPlace(id: string) {
    setSelectedId(id)
    const p = places?.find((x) => x.id === id)
    if (p?.lat != null && p?.lng != null) setFocus({ lat: p.lat, lng: p.lng })
  }

  return (
    <section className="card places-card">
      <h3>Places</h3>
      {error && <p className="auth-error">{error}</p>}

      <div className="places-top">
        <PlaceSearch onAdd={addPlace} />
      </div>

      <div className="places-map-wrap">
        <MapView
          center={center}
          zoom={located.length ? 12 : DEFAULT_ZOOM}
          markers={markers}
          focus={focus}
          onMarkerClick={selectPlace}
          onMapClick={(pos) => void addPlace({ name: 'New place', lat: pos.lat, lng: pos.lng })}
        />
        <p className="map-hint muted small">Click the map to drop a place, or a pin to edit it.</p>
      </div>

      <div className="places-detail">
          <div className="wishlist">
            <div className="wishlist-head">
              <span>Wishlist</span>
              <span className="muted">{places?.length ?? 0}</span>
            </div>
            {places === null && <p className="muted">Loading…</p>}
            {places !== null && places.length === 0 && (
              <p className="muted small">
                Search above, or click anywhere on the map to drop a place.
              </p>
            )}
            <ul className="place-list">
              {(places ?? []).map((p) => {
                const meta = categoryMeta(p.category)
                return (
                  <li key={p.id}>
                    <button
                      className={`place-row${p.id === selectedId ? ' active' : ''}`}
                      onClick={() => selectPlace(p.id)}
                    >
                      <span className="place-emoji" title={meta.label}>{meta.emoji}</span>
                      <span className="place-row-name">{p.name}</span>
                      {p.est_cost != null && <span className="muted small">{p.est_cost}</span>}
                      {(p.lat == null || p.lng == null) && (
                        <span className="muted small" title="No location set">no pin</span>
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
  onAdd: (input: { name: string; lat: number; lng: number }) => void
}) {
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
    const t = setTimeout(async () => {
      setBusy(true)
      setErr(null)
      try {
        setResults(await searchPlaces(query, controller.signal))
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setErr('Search failed, try again.')
      } finally {
        setBusy(false)
      }
    }, 400)
    return () => {
      controller.abort()
      clearTimeout(t)
    }
  }, [query])

  return (
    <div className="place-search">
      <input
        value={query}
        placeholder="Search a place…"
        onChange={(e) => setQuery(e.target.value)}
      />
      {busy && <p className="muted small">Searching…</p>}
      {err && <p className="auth-error small">{err}</p>}
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r, i) => (
            <li key={i}>
              <button
                onClick={() => {
                  onAdd({ name: r.name, lat: r.lat, lng: r.lng })
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
  const [name, setName] = useState(place.name)
  const [category, setCategory] = useState<PlaceCategory>(place.category)
  const [notes, setNotes] = useState(place.notes ?? '')
  const [hours, setHours] = useState(place.opening_hours ?? '')
  const [cost, setCost] = useState(place.est_cost?.toString() ?? '')

  return (
    <div className="place-editor">
      <div className="editor-head">
        <strong>Edit place</strong>
        <button className="linklike" onClick={onClose}>close</button>
      </div>

      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label>
        Category
        <div className="cat-chips">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`cat-chip${category === c.key ? ' active' : ''}`}
              style={category === c.key ? { borderColor: c.color, color: c.color } : undefined}
              onClick={() => setCategory(c.key)}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </label>

      <div className="form-row">
        <label>
          Est. cost
          <input
            type="number"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0"
          />
        </label>
        <label>
          Opening hours
          <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="9–17" />
        </label>
      </div>

      <label>
        Notes
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="button-row">
        <button
          onClick={() =>
            onSave({
              name: name.trim() || 'Untitled',
              category,
              notes: notes.trim() || null,
              opening_hours: hours.trim() || null,
              est_cost: cost.trim() === '' ? null : Number(cost),
            })
          }
        >
          Save
        </button>
        <button className="secondary danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}
