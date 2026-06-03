import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { useTripRealtime } from '../lib/useTripRealtime'
import { useT } from '../i18n/I18nProvider'
import type { Area, Day, Place, Stop } from '../lib/database.types'
import { categoryMeta, placeColor } from '../places/categories'
import { MapView } from '../map/MapView'
import type { MapMarker } from '../map'
import { getRouteCached, getRoutePathCached, legKey, type LatLng, type RouteLeg } from '../routing'
import {
  addDays,
  addMonths,
  dayOfMonth,
  formatDayLabel,
  formatMonthDay,
  isSameMonth,
  monthGrid,
  monthName,
  startOfWeek,
  today,
  weekDates,
  weekdayHeaders,
} from './dates'
import { buildICS, downloadICS, type IcsEvent } from './ics'

type ViewMode = 'day' | 'week' | 'month'

interface BoardStop extends Stop {
  place: Place
}
interface BoardDay {
  day: Day
  stops: BoardStop[]
}

export function ItineraryBoard({
  tripId,
  startDate,
  endDate,
}: {
  tripId: string
  startDate: string | null
  endDate: string | null
}) {
  const { t, locale } = useT()
  const [days, setDays] = useState<Day[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [stops, setStops] = useState<Stop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeLabel, setActiveLabel] = useState<string | null>(null)

  const todayIso = today()
  const todayInTrip = !!startDate && !!endDate && todayIso >= startDate && todayIso <= endDate
  // When the trip is happening now, open straight to today's day (the "Today" feel).
  const [view, setView] = useState<ViewMode>(todayInTrip ? 'day' : 'month')
  const [cursor, setCursor] = useState<string>(todayInTrip ? todayIso : startDate ?? todayIso)

  const load = useCallback(async () => {
    const [daysRes, areasRes, placesRes] = await Promise.all([
      supabase.from('days').select('*').eq('trip_id', tripId).order('date'),
      supabase.from('areas').select('*').eq('trip_id', tripId).order('sort_order'),
      supabase.from('places').select('*').eq('trip_id', tripId),
    ])
    if (daysRes.error || areasRes.error || placesRes.error) {
      setError(daysRes.error?.message ?? areasRes.error?.message ?? placesRes.error?.message ?? null)
      setLoading(false)
      return
    }
    const dayRows = daysRes.data ?? []
    const dayIds = dayRows.map((d) => d.id)
    let stopRows: Stop[] = []
    if (dayIds.length) {
      const stopsRes = await supabase.from('stops').select('*').in('day_id', dayIds).order('sort_order')
      if (stopsRes.error) setError(stopsRes.error.message)
      else stopRows = stopsRes.data ?? []
    }
    setDays(dayRows)
    setAreas(areasRes.data ?? [])
    setPlaces(placesRes.data ?? [])
    setStops(stopRows)
    setLoading(false)
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  useTripRealtime(tripId, load)

  const placeMap = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])

  // Quick lookup: ISO date -> the day and its ordered stops.
  const byDate = useMemo(() => {
    const map = new Map<string, BoardDay>()
    for (const day of days) {
      const dayStops = stops
        .filter((s) => s.day_id === day.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({ ...s, place: placeMap.get(s.place_id)! }))
        .filter((s) => s.place)
      map.set(day.date, { day, stops: dayStops })
    }
    return map
  }, [days, stops, placeMap])

  // Build a calendar (.ics) of every scheduled (timed) stop, with an alarm for any
  // stop that has a reminder set. The phone calendar then delivers the reminders.
  const timedEvents = useMemo<IcsEvent[]>(() => {
    const out: IcsEvent[] = []
    for (const day of days) {
      for (const s of stops.filter((x) => x.day_id === day.id)) {
        if (!s.arrival_time) continue
        const place = placeMap.get(s.place_id)
        if (!place) continue
        out.push({
          date: day.date,
          time: s.arrival_time.slice(0, 5),
          durationMin: s.duration_min,
          reminderMin: s.reminder_min,
          title: place.name,
          location: place.city ?? null,
        })
      }
    }
    return out
  }, [days, stops, placeMap])

  function exportCalendar() {
    if (timedEvents.length === 0) return
    downloadICS('trip-itinerary.ics', buildICS(timedEvents, t('itin.calName')))
  }

  // Places stay in the palette permanently (reusable). Count how many times each
  // is scheduled so the panel can show a ×N badge.
  const scheduleCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of stops) m.set(s.place_id, (m.get(s.place_id) ?? 0) + 1)
    return m
  }, [stops])

  // Clicking a stop in Day view centers the day map on it.
  const [focusPoint, setFocusPoint] = useState<LatLng | null>(null)
  const [focusStopId, setFocusStopId] = useState<string | null>(null)
  useEffect(() => {
    // Reset focus when the day changes so the map fits the new day's stops.
    setFocusPoint(null)
    setFocusStopId(null)
  }, [cursor])
  function focusStop(s: BoardStop) {
    if (s.place.lat == null || s.place.lng == null) return
    setFocusPoint({ lat: s.place.lat, lng: s.place.lng })
    setFocusStopId(s.id)
  }

  // Travel legs between consecutive located stops, fetched (cached) lazily.
  const [routeLegs, setRouteLegs] = useState<Map<string, RouteLeg | null>>(new Map())
  const fetchedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const need: { key: string; o: LatLng; d: LatLng }[] = []
    for (const bd of byDate.values()) {
      const located = bd.stops.filter((s) => s.place.lat != null && s.place.lng != null)
      for (let i = 1; i < located.length; i++) {
        const o = { lat: located[i - 1].place.lat!, lng: located[i - 1].place.lng! }
        const d = { lat: located[i].place.lat!, lng: located[i].place.lng! }
        const key = legKey(o, d)
        if (!fetchedRef.current.has(key)) need.push({ key, o, d })
      }
    }
    if (need.length === 0) return
    need.forEach((n) => fetchedRef.current.add(n.key))
    let cancelled = false
    void (async () => {
      const results = await Promise.all(need.map(async (n) => [n.key, await getRouteCached(n.o, n.d)] as const))
      if (!cancelled) {
        setRouteLegs((prev) => {
          const m = new Map(prev)
          for (const [key, leg] of results) m.set(key, leg)
          return m
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [byDate])

  const sensors = useSensors(
    // Mouse: drag starts after a small move. Touch: drag starts after a brief
    // hold, so quick swipes still scroll the page on phones.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // --- persistence helpers -------------------------------------------------
  const persistOrder = useCallback(async (dayId: string, stopIds: string[]) => {
    await Promise.all(
      stopIds.map((id, i) => supabase.from('stops').update({ day_id: dayId, sort_order: i }).eq('id', id)),
    )
  }, [])

  // Returns the day row id for a date, creating the row if it doesn't exist yet.
  async function ensureDay(iso: string): Promise<string | null> {
    const existing = days.find((d) => d.date === iso)
    if (existing) return existing.id
    const { data, error } = await supabase
      .from('days')
      .insert({ trip_id: tripId, date: iso })
      .select('id')
      .single()
    if (error) {
      setError(error.message)
      return null
    }
    return data.id
  }

  type Dest = { type: 'wishlist' } | { type: 'date'; iso: string; index: number }

  function resolveDrop(overId: string): Dest {
    if (overId === 'wishlist' || overId.startsWith('place:')) return { type: 'wishlist' }
    if (overId.startsWith('date:')) {
      const iso = overId.slice(5)
      return { type: 'date', iso, index: byDate.get(iso)?.stops.length ?? 0 }
    }
    // over a stop
    const stopId = overId.slice(5)
    for (const [iso, bd] of byDate) {
      const idx = bd.stops.findIndex((s) => s.id === stopId)
      if (idx !== -1) return { type: 'date', iso, index: idx }
    }
    return { type: 'wishlist' }
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveLabel(null)
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const dest = resolveDrop(String(over.id))

    if (activeId.startsWith('place:')) {
      if (dest.type !== 'date') return
      const placeId = activeId.slice(6)
      const dayId = await ensureDay(dest.iso)
      if (!dayId) return
      // Pre-fill the visit's cost from the place's est_cost (editable per visit).
      const prefillCost = placeMap.get(placeId)?.est_cost ?? null
      const { data: created, error } = await supabase
        .from('stops')
        .insert({ day_id: dayId, place_id: placeId, sort_order: 9999, cost: prefillCost })
        .select('id')
        .single()
      if (error) return setError(error.message)
      const ids = (byDate.get(dest.iso)?.stops ?? []).map((s) => s.id)
      ids.splice(dest.index, 0, created.id)
      await persistOrder(dayId, ids)
      return load()
    }

    if (activeId.startsWith('stop:')) {
      const stopId = activeId.slice(5)
      let sourceDay: BoardDay | undefined
      for (const bd of byDate.values()) if (bd.stops.some((s) => s.id === stopId)) sourceDay = bd
      if (!sourceDay) return

      if (dest.type === 'wishlist') {
        // Remove just this visit; the place stays in the palette.
        await supabase.from('stops').delete().eq('id', stopId)
        return load()
      }

      const destDayId = await ensureDay(dest.iso)
      if (!destDayId) return

      if (dest.iso === sourceDay.day.date) {
        const ids = sourceDay.stops.map((s) => s.id)
        const from = ids.indexOf(stopId)
        if (from === dest.index) return
        await persistOrder(destDayId, arrayMove(ids, from, dest.index))
        return load()
      }

      const srcIds = sourceDay.stops.map((s) => s.id).filter((id) => id !== stopId)
      const destIds = (byDate.get(dest.iso)?.stops ?? []).map((s) => s.id)
      destIds.splice(dest.index, 0, stopId)
      await persistOrder(sourceDay.day.id, srcIds)
      await persistOrder(destDayId, destIds)
      return load()
    }
  }

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id)
    if (id.startsWith('place:')) setActiveLabel(placeMap.get(id.slice(6))?.name ?? 'Place')
    else if (id.startsWith('stop:')) {
      const s = stops.find((x) => x.id === id.slice(5))
      setActiveLabel(s ? placeMap.get(s.place_id)?.name ?? 'Stop' : 'Stop')
    }
  }

  // Human-friendly names for screen-reader announcements.
  function nameForId(id: string): string {
    if (id.startsWith('place:')) return placeMap.get(id.slice(6))?.name ?? 'place'
    if (id.startsWith('stop:')) {
      const s = stops.find((x) => x.id === id.slice(5))
      return s ? placeMap.get(s.place_id)?.name ?? 'stop' : 'stop'
    }
    return 'item'
  }
  function zoneForId(id: string): string {
    if (id === 'wishlist' || id.startsWith('place:')) return t('itin.palettePlaces')
    if (id.startsWith('date:')) return formatDayLabel(id.slice(5), locale)
    if (id.startsWith('stop:')) {
      for (const bd of byDate.values()) if (bd.stops.some((s) => s.id === id.slice(5))) return formatDayLabel(bd.day.date, locale)
    }
    return t('itin.view.day')
  }
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) =>
      `${nameForId(String(active.id))}`,
    onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `${nameForId(String(active.id))} → ${zoneForId(String(over.id))}` : undefined,
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `${nameForId(String(active.id))} → ${zoneForId(String(over.id))}` : `${nameForId(String(active.id))}`,
    onDragCancel: ({ active }: { active: { id: string | number } }) => `${nameForId(String(active.id))}`,
  }

  // --- area helpers --------------------------------------------------------
  async function addArea(name: string) {
    const { error } = await supabase.from('areas').insert({ trip_id: tripId, name, sort_order: areas.length })
    if (error) setError(error.message)
    else load()
  }
  async function setDayArea(iso: string, areaId: string | null) {
    const dayId = await ensureDay(iso)
    if (!dayId) return
    await supabase.from('days').update({ area_id: areaId }).eq('id', dayId)
    load()
  }
  async function setDayNote(iso: string, note: string) {
    const dayId = await ensureDay(iso)
    if (!dayId) return
    await supabase.from('days').update({ note: note.trim() || null }).eq('id', dayId)
    load()
  }
  async function clearDay(bd: BoardDay) {
    if (!confirm(t('itin.confirmClearDay', { day: formatDayLabel(bd.day.date, locale) }))) return
    await supabase.from('days').delete().eq('id', bd.day.id) // cascades its stops
    load()
  }

  // --- navigation ----------------------------------------------------------
  function shift(dir: number) {
    if (view === 'day') setCursor(addDays(cursor, dir))
    else if (view === 'week') setCursor(addDays(cursor, dir * 7))
    else setCursor(addMonths(cursor, dir))
  }

  const title =
    view === 'day'
      ? formatDayLabel(cursor, locale)
      : view === 'week'
        ? `${formatMonthDay(startOfWeek(cursor), locale)} – ${formatMonthDay(addDays(startOfWeek(cursor), 6), locale)}`
        : monthName(cursor, locale)

  const inTrip = (iso: string) => (!startDate || iso >= startDate) && (!endDate || iso <= endDate)

  if (loading) return <p className="muted">{t('itin.loading')}</p>

  return (
    <div className="itinerary">
      {error && <p className="auth-error">{error}</p>}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t('itin.dragInstructions') },
        }}
      >
        <div className="itinerary-grid">
          <PlacesPalette places={places} counts={scheduleCounts} />

          <div className="cal-area">
            <AreasBar areas={areas} onAdd={addArea} />

            <div className="cal-toolbar">
              <div className="cal-nav">
                <button className="nav-btn" onClick={() => shift(-1)} aria-label={t('itin.prev')}>‹</button>
                <button className="secondary" onClick={() => setCursor(startDate ?? today())}>
                  {startDate ? t('itin.tripStart') : t('itin.today')}
                </button>
                <button className="nav-btn" onClick={() => shift(1)} aria-label={t('itin.next')}>›</button>
                <span className="cal-title">{title}</span>
              </div>
              <div className="cal-views">
                {(['day', 'week', 'month'] as const).map((v) => (
                  <button key={v} className={`seg${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
                    {t(`itin.view.${v}`)}
                  </button>
                ))}
              </div>
              <button
                className="secondary cal-export"
                onClick={exportCalendar}
                disabled={timedEvents.length === 0}
                title={t('itin.addToCalendarHint')}
              >
                {t('itin.addToCalendar')}
              </button>
            </div>

            {view === 'month' && (
              <MonthView
                cursor={cursor}
                byDate={byDate}
                inTrip={inTrip}
                todayIso={todayIso}
                onOpenDay={(iso) => {
                  setCursor(iso)
                  setView('day')
                }}
              />
            )}

            {view === 'week' && (
              <div className="cal-week">
                {weekDates(cursor).map((iso) => (
                  <DayPanel
                    key={iso}
                    iso={iso}
                    boardDay={byDate.get(iso)}
                    areas={areas}
                    inTrip={inTrip(iso)}
                    variant="week"
                    isToday={iso === todayIso}
                    onAreaChange={(areaId) => setDayArea(iso, areaId)}
                    onNoteChange={(note) => setDayNote(iso, note)}
                    onClear={byDate.get(iso) ? () => clearDay(byDate.get(iso)!) : undefined}
                    onOpenDay={() => {
                      setCursor(iso)
                      setView('day')
                    }}
                    routeLegs={routeLegs}
                    onStopChange={load}
                  />
                ))}
              </div>
            )}

            {view === 'day' && (
              <div className="cal-day">
                <DayPanel
                  iso={cursor}
                  boardDay={byDate.get(cursor)}
                  areas={areas}
                  inTrip={inTrip(cursor)}
                  variant="day"
                  isToday={cursor === todayIso}
                  onAreaChange={(areaId) => setDayArea(cursor, areaId)}
                  onNoteChange={(note) => setDayNote(cursor, note)}
                  onClear={byDate.get(cursor) ? () => clearDay(byDate.get(cursor)!) : undefined}
                  onFocusStop={focusStop}
                  routeLegs={routeLegs}
                  onStopChange={load}
                />
                <ItineraryDayMap
                  iso={cursor}
                  stops={byDate.get(cursor)?.stops ?? []}
                  focus={focusPoint}
                  selectedId={focusStopId}
                />
              </div>
            )}
          </div>
        </div>

        <DragOverlay>{activeLabel ? <div className="drag-overlay">{activeLabel}</div> : null}</DragOverlay>
      </DndContext>
    </div>
  )
}

// --- Month view ----------------------------------------------------------
function MonthView({
  cursor,
  byDate,
  inTrip,
  todayIso,
  onOpenDay,
}: {
  cursor: string
  byDate: Map<string, BoardDay>
  inTrip: (iso: string) => boolean
  todayIso: string
  onOpenDay: (iso: string) => void
}) {
  const { locale } = useT()
  const grid = monthGrid(cursor)
  return (
    <div className="cal-month">
      <div className="cal-weekdays">
        {weekdayHeaders(1, locale).map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="cal-grid">
        {grid.map((iso) => (
          <MonthCell
            key={iso}
            iso={iso}
            boardDay={byDate.get(iso)}
            dim={!isSameMonth(iso, cursor) || !inTrip(iso)}
            isToday={iso === todayIso}
            onOpen={() => onOpenDay(iso)}
          />
        ))}
      </div>
    </div>
  )
}

function MonthCell({
  iso,
  boardDay,
  dim,
  isToday,
  onOpen,
}: {
  iso: string
  boardDay?: BoardDay
  dim: boolean
  isToday: boolean
  onOpen: () => void
}) {
  const { t, locale } = useT()
  const { setNodeRef, isOver } = useDroppable({ id: `date:${iso}` })
  const stops = boardDay?.stops ?? []
  return (
    <div
      ref={setNodeRef}
      className={`month-cell${dim ? ' dim' : ''}${isOver ? ' over' : ''}${isToday ? ' today' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${formatDayLabel(iso, locale)} · ${stops.length} · ${t('itin.openDay')}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="month-cell-date">{dayOfMonth(iso)}{isToday && <span className="today-dot" />}</div>
      <div className="month-cell-stops">
        {stops.slice(0, 3).map((s) => (
          <div key={s.id} className="month-chip">
            <span>{categoryMeta(s.place.category).emoji}</span>
            <span className="month-chip-name">{s.place.name}</span>
          </div>
        ))}
        {stops.length > 3 && <div className="month-more">+{stops.length - 3}</div>}
      </div>
    </div>
  )
}

// --- Day panel (week column / single day) -------------------------------
function DayPanel({
  iso,
  boardDay,
  areas,
  inTrip,
  variant,
  isToday,
  routeLegs,
  onAreaChange,
  onNoteChange,
  onClear,
  onOpenDay,
  onFocusStop,
  onStopChange,
}: {
  iso: string
  boardDay?: BoardDay
  areas: Area[]
  inTrip: boolean
  variant: 'week' | 'day'
  isToday?: boolean
  routeLegs: Map<string, RouteLeg | null>
  onAreaChange: (areaId: string | null) => void
  onNoteChange: (note: string) => void
  onClear?: () => void
  onOpenDay?: () => void
  onFocusStop?: (s: BoardStop) => void
  onStopChange: () => void
}) {
  const { t, locale } = useT()
  const { setNodeRef, isOver } = useDroppable({ id: `date:${iso}` })
  const stops = boardDay?.stops ?? []

  // Connector text shown above each stop (travel from the previous one), plus a
  // running total of travel minutes for the busy-day flag.
  let travelMin = 0
  const connectors = stops.map((s, i): string | null => {
    if (i === 0) return null
    const prev = stops[i - 1]
    if (prev.place.lat == null || prev.place.lng == null || s.place.lat == null || s.place.lng == null) {
      return t('itin.locationMissing')
    }
    const leg = routeLegs.get(
      legKey({ lat: prev.place.lat, lng: prev.place.lng }, { lat: s.place.lat, lng: s.place.lng }),
    )
    if (leg === undefined) return '…'
    if (leg === null) return t('itin.noRoute')
    const mins = Math.round(leg.durationSeconds / 60)
    travelMin += mins
    return `${formatKm(leg.distanceMeters)} · ${mins} min`
  })

  const visitMin = stops.reduce((sum, s) => sum + (s.duration_min ?? 0), 0)
  const busy = travelMin > 300 || travelMin + visitMin > 720

  return (
    <div className={`day-panel ${variant}${isOver ? ' over' : ''}${inTrip ? '' : ' out-of-trip'}${isToday ? ' today' : ''}`}>
      <div className="day-head">
        {onOpenDay ? (
          <button className="day-open" onClick={onOpenDay} title={t('itin.openDay')}>
            {formatDayLabel(iso, locale)}
            {isToday && <span className="today-pill">{t('itin.today')}</span>}
          </button>
        ) : (
          <strong>
            {formatDayLabel(iso, locale)}
            {isToday && <span className="today-pill">{t('itin.today')}</span>}
          </strong>
        )}
        <span className="day-head-right">
          {busy && <span className="busy-flag" title={t('itin.busyTitle')}>{t('itin.busy')}</span>}
          {travelMin > 0 && <span className="muted small"><bdi dir="ltr">{formatTravelTotal(travelMin)}</bdi> {t('itin.travel')}</span>}
          {onClear && (
            <button className="linklike danger" onClick={onClear} title={t('itin.clearDay')} aria-label={t('itin.clearDay')}>×</button>
          )}
        </span>
      </div>
      {boardDay && (
        <select className="area-select" value={boardDay.day.area_id ?? ''} onChange={(e) => onAreaChange(e.target.value || null)}>
          <option value="">{t('itin.noArea')}</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}
      {variant === 'day' ? (
        <DayNoteEditor key={iso} initial={boardDay?.day.note ?? ''} onCommit={onNoteChange} />
      ) : (
        boardDay?.day.note && <p className="day-note-ro muted small">📝 {boardDay.day.note}</p>
      )}
      <div ref={setNodeRef} className="stop-dropzone">
        <SortableContext items={stops.map((s) => `stop:${s.id}`)} strategy={verticalListSortingStrategy}>
          {stops.map((s, i) => (
            <StopItem
              key={s.id}
              stop={s}
              connector={connectors[i]}
              onFocus={onFocusStop ? () => onFocusStop(s) : undefined}
              onChange={onStopChange}
            />
          ))}
        </SortableContext>
        {stops.length === 0 && <p className="muted small empty-day">{t('itin.dropHere')}</p>}
      </div>
    </div>
  )
}

function DayNoteEditor({ initial, onCommit }: { initial: string; onCommit: (note: string) => void }) {
  const { t } = useT()
  const [note, setNote] = useState(initial)
  return (
    <textarea
      className="day-note-input"
      rows={2}
      placeholder={t('itin.dayNotePlaceholder')}
      value={note}
      onChange={(e) => setNote(e.target.value)}
      onBlur={() => {
        if (note !== initial) onCommit(note)
      }}
    />
  )
}

function ItineraryDayMap({
  iso,
  stops,
  focus,
  selectedId,
}: {
  iso: string
  stops: BoardStop[]
  focus?: LatLng | null
  selectedId?: string | null
}) {
  const { t } = useT()
  const located = stops.filter((s) => s.place.lat != null && s.place.lng != null)
  const straightPath: LatLng[] = located.map((s) => ({ lat: s.place.lat!, lng: s.place.lng! }))
  const coordsKey = straightPath.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')

  const [roadPath, setRoadPath] = useState<LatLng[] | null>(null)
  useEffect(() => {
    let cancelled = false
    setRoadPath(null)
    if (straightPath.length >= 2) {
      getRoutePathCached(straightPath).then((p) => {
        if (!cancelled) setRoadPath(p)
      })
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordsKey])

  if (located.length === 0) return null

  const markers: MapMarker[] = located.map((s, i) => ({
    id: s.id,
    position: { lat: s.place.lat!, lng: s.place.lng! },
    category: s.place.category,
    color: s.place.color ?? undefined,
    badge: i + 1,
    label: `${i + 1}. ${s.place.name}`,
    selected: s.id === selectedId,
  }))

  return (
    <div className="itinerary-map">
      {/* key by day so the map re-fits when switching days */}
      <MapView
        key={iso}
        center={straightPath[0]}
        zoom={13}
        markers={markers}
        path={roadPath ?? straightPath}
        focus={focus ?? null}
      />
      <p className="muted small">
        {t('itin.mapHint', { state: roadPath ? t('itin.mapHintRoad') : t('itin.mapHintLoading') })}
      </p>
    </div>
  )
}

function formatKm(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

function formatTravelTotal(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

// --- Places palette (reusable; drag a place onto a day as many times as you like)
function PlacesPalette({ places, counts }: { places: Place[]; counts: Map<string, number> }) {
  const { t } = useT()
  const { setNodeRef, isOver } = useDroppable({ id: 'wishlist' })
  return (
    <div ref={setNodeRef} className={`wishlist-col${isOver ? ' over' : ''}`}>
      <div className="wishlist-head">
        <span>{t('itin.palettePlaces')}</span>
        <span className="muted">{places.length}</span>
      </div>
      {places.length === 0 && <p className="muted small">{t('itin.paletteEmpty')}</p>}
      {places.map((p) => (
        <PaletteItem key={p.id} place={p} count={counts.get(p.id) ?? 0} />
      ))}
      <p className="muted small drag-hint">{t('itin.paletteHint')}</p>
    </div>
  )
}

function PaletteItem({ place, count }: { place: Place; count: number }) {
  const { t } = useT()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `place:${place.id}` })
  const meta = categoryMeta(place.category)
  return (
    <div
      ref={setNodeRef}
      className={`drag-card${isDragging ? ' dragging' : ''}`}
      style={{
        ...(transform ? { transform: CSS.Translate.toString(transform) } : {}),
        borderInlineStartColor: placeColor(place.category, place.color),
        borderInlineStartWidth: 3,
      }}
      {...listeners}
      {...attributes}
    >
      <span className="place-emoji">{meta.emoji}</span>
      <span className="place-row-name">{place.name}</span>
      {place.notes && <span title={place.notes}>📝</span>}
      {count > 0 && <span className="sched-badge" title={t('itin.scheduledTimes', { n: count })}>×{count}</span>}
    </div>
  )
}

function StopItem({
  stop,
  connector,
  onFocus,
  onChange,
}: {
  stop: BoardStop
  connector: string | null
  onFocus?: () => void
  onChange: () => void
}) {
  const { t } = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `stop:${stop.id}`,
  })
  const meta = categoryMeta(stop.place.category)
  const [time, setTime] = useState(stop.arrival_time?.slice(0, 5) ?? '')
  const [dur, setDur] = useState(stop.duration_min?.toString() ?? '')
  const [cost, setCost] = useState(stop.cost?.toString() ?? '')
  const [reminder, setReminder] = useState(stop.reminder_min != null ? String(stop.reminder_min) : '')

  async function commit(patch: {
    arrival_time?: string | null
    duration_min?: number | null
    cost?: number | null
    reminder_min?: number | null
  }) {
    await supabase.from('stops').update(patch).eq('id', stop.id)
    onChange()
  }
  async function remove() {
    await supabase.from('stops').delete().eq('id', stop.id)
    onChange()
  }

  return (
    <div
      ref={setNodeRef}
      className="stop-wrap"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {connector && (
        <div className="stop-connector">
          <span className="connector-line" />
          {/* Numbers + units are LTR data; isolate so it doesn't reorder under RTL. */}
          <bdi className="connector-text" dir="ltr">🚗 {connector}</bdi>
        </div>
      )}
      <div
        className={`stop-card${isDragging ? ' dragging' : ''}`}
        style={{ borderInlineStartColor: placeColor(stop.place.category, stop.place.color), borderInlineStartWidth: 3 }}
      >
      <span
        className="stop-grip"
        {...listeners}
        {...attributes}
        aria-label={t('itin.reorder', { name: stop.place.name })}
      >
        ⋮⋮
      </span>
      <span className="place-emoji">{meta.emoji}</span>
      <div className="stop-main">
        <span
          className={`stop-name${onFocus ? ' clickable' : ''}`}
          onClick={onFocus}
          title={onFocus ? t('itin.showOnMap') : undefined}
          role={onFocus ? 'button' : undefined}
          tabIndex={onFocus ? 0 : undefined}
          aria-label={onFocus ? `${stop.place.name} — ${t('itin.showOnMap')}` : undefined}
          onKeyDown={
            onFocus
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onFocus()
                  }
                }
              : undefined
          }
        >
          {stop.place.name}
        </span>
        {stop.place.notes && <span className="stop-note" title={stop.place.notes}>📝 {stop.place.notes}</span>}
        <div className="stop-times">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onBlur={() => commit({ arrival_time: time || null })}
            title="Arrival time (optional)"
          />
          <input
            type="number"
            min="0"
            placeholder="min"
            className="dur-input"
            value={dur}
            onChange={(e) => setDur(e.target.value)}
            onBlur={() => commit({ duration_min: dur === '' ? null : Number(dur) })}
            title={t('places.openingHours')}
          />
          <input
            type="number"
            min="0"
            inputMode="decimal"
            placeholder={t('places.estCost')}
            className="cost-input"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            onBlur={() => commit({ cost: cost === '' ? null : Number(cost) })}
            title={t('places.estCost')}
          />
          <select
            className="reminder-select"
            value={reminder}
            disabled={!time}
            title={time ? t('itin.remindTitle') : t('itin.remindNeedsTime')}
            aria-label={t('itin.remindTitle')}
            onChange={(e) => {
              setReminder(e.target.value)
              commit({ reminder_min: e.target.value === '' ? null : Number(e.target.value) })
            }}
          >
            <option value="">{t('itin.remind.off')}</option>
            <option value="0">{t('itin.remind.at')}</option>
            <option value="10">{t('itin.remind.10')}</option>
            <option value="30">{t('itin.remind.30')}</option>
            <option value="60">{t('itin.remind.60')}</option>
            <option value="1440">{t('itin.remind.1440')}</option>
          </select>
        </div>
      </div>
      <button className="linklike danger" onClick={remove} title={t('itin.removeFromDay')} aria-label={t('itin.removeFromDay')}>×</button>
      </div>
    </div>
  )
}

function AreasBar({ areas, onAdd }: { areas: Area[]; onAdd: (name: string) => void }) {
  const { t } = useT()
  const [name, setName] = useState('')
  return (
    <div className="areas-bar">
      <span className="muted small">{t('itin.areas')}</span>
      {areas.map((a) => (
        <span key={a.id} className="area-chip">{a.name}</span>
      ))}
      <form
        className="area-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) {
            onAdd(name.trim())
            setName('')
          }
        }}
      >
        <input value={name} placeholder={t('itin.addArea')} onChange={(e) => setName(e.target.value)} />
      </form>
    </div>
  )
}
