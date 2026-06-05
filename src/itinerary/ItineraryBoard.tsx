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
import { useToast } from '../components/Toast'
import { useT } from '../i18n/I18nProvider'
import type { Area, BudgetEntry, Day, DayReference, PackingItem, Place, PlaceCategory, Stop } from '../lib/database.types'
import { CATEGORIES, categoryMeta, placeColor } from '../places/categories'
import { MapView } from '../map/MapView'
import type { MapMarker } from '../map'
import { getRouteCached, getRoutePathCached, legKey, type LatLng, type RouteLeg } from '../routing'
import {
  addDays,
  addMonths,
  dateRange,
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
import { formatMoney } from '../budget/money'
import { useTripWeather, weatherMeta, normalEmoji, type DayWeather } from '../weather/openMeteo'

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
  tripName,
  currency,
  notes,
  startDate,
  endDate,
}: {
  tripId: string
  tripName: string
  currency: string
  notes: string | null
  startDate: string | null
  endDate: string | null
}) {
  const { t, locale } = useT()
  const toast = useToast()
  const [days, setDays] = useState<Day[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [stops, setStops] = useState<Stop[]>([])
  const [budgetEntries, setBudgetEntries] = useState<BudgetEntry[]>([])
  const [packing, setPacking] = useState<PackingItem[]>([])
  const [dayRefs, setDayRefs] = useState<DayReference[]>([])
  // What to include in the printable itinerary (the day plan is always included).
  const [printOpts, setPrintOpts] = useState({ notes: true, budget: true, packing: true, dayCosts: true })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeLabel, setActiveLabel] = useState<string | null>(null)

  const todayIso = today()
  const todayInTrip = !!startDate && !!endDate && todayIso >= startDate && todayIso <= endDate
  // When the trip is happening now, open straight to today's day (the "Today" feel).
  const [view, setView] = useState<ViewMode>(todayInTrip ? 'day' : 'month')
  const [cursor, setCursor] = useState<string>(todayInTrip ? todayIso : startDate ?? todayIso)

  const load = useCallback(async () => {
    const [daysRes, areasRes, placesRes, entriesRes, packingRes] = await Promise.all([
      supabase.from('days').select('*').eq('trip_id', tripId).order('date'),
      supabase.from('areas').select('*').eq('trip_id', tripId).order('sort_order'),
      supabase.from('places').select('*').eq('trip_id', tripId),
      supabase.from('budget_entries').select('*').eq('trip_id', tripId),
      supabase.from('packing_items').select('*').eq('trip_id', tripId).order('sort_order'),
    ])
    // Budget + packing feed only the print/PDF export, so a failure there must never
    // block the itinerary itself — default to empty.
    setBudgetEntries(entriesRes.data ?? [])
    setPacking(packingRes.data ?? [])
    if (daysRes.error || areasRes.error || placesRes.error) {
      setError(daysRes.error?.message ?? areasRes.error?.message ?? placesRes.error?.message ?? null)
      setLoading(false)
      return
    }
    const dayRows = daysRes.data ?? []
    const dayIds = dayRows.map((d) => d.id)
    let stopRows: Stop[] = []
    let refRows: DayReference[] = []
    if (dayIds.length) {
      const [stopsRes, refsRes] = await Promise.all([
        supabase.from('stops').select('*').in('day_id', dayIds).order('sort_order'),
        supabase.from('day_references').select('*').in('day_id', dayIds),
      ])
      if (stopsRes.error) setError(stopsRes.error.message)
      else stopRows = stopsRes.data ?? []
      refRows = refsRes.data ?? []
    }
    setDays(dayRows)
    setAreas(areasRes.data ?? [])
    setPlaces(placesRes.data ?? [])
    setStops(stopRows)
    setDayRefs(refRows)
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

  // Per-day weather (Open-Meteo, keyless). Each day uses its first located stop's
  // coordinates, falling back to the trip's first located place, so every in-range
  // date gets a forecast at the right place. Only the ~16-day window is fetched.
  const tripCoord = useMemo(() => {
    const p = places.find((x) => x.lat != null && x.lng != null)
    return p ? { lat: p.lat as number, lng: p.lng as number } : null
  }, [places])
  const weatherEntries = useMemo(() => {
    if (!tripCoord) return []
    const dates = new Set<string>()
    if (startDate && endDate) for (const d of dateRange(startDate, endDate)) dates.add(d)
    for (const d of byDate.keys()) dates.add(d)
    return [...dates].map((date) => {
      const located = byDate.get(date)?.stops.find((s) => s.place.lat != null && s.place.lng != null)
      const coord = located ? { lat: located.place.lat as number, lng: located.place.lng as number } : tripCoord
      return { date, lat: coord.lat, lng: coord.lng }
    })
  }, [byDate, tripCoord, startDate, endDate])
  const weatherByDate = useTripWeather(weatherEntries)

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

  // Days to print: every day that has stops or a note, in date order. (Empty days are
  // skipped so the printout stays a clean plan, not a blank calendar.)
  const printDays = useMemo(
    () =>
      [...byDate.values()]
        .filter((bd) => bd.stops.length > 0 || bd.day.note)
        .sort((a, b) => a.day.date.localeCompare(b.day.date)),
    [byDate],
  )

  // Budget summary for the printout (mirrors BudgetPanel): per-stop + per-leg costs by
  // place category, travel costs under Transport, plus manual budget entries.
  const budget = useMemo(() => {
    const stopTotal = stops.reduce((sum, s) => sum + (s.cost ?? 0) + (s.travel_cost ?? 0), 0)
    const entriesTotal = budgetEntries.reduce((sum, e) => sum + Number(e.amount), 0)
    const map = new Map<string, number>()
    for (const s of stops) {
      if (s.cost) {
        const cat = t(`cat.${placeMap.get(s.place_id)?.category ?? 'sight'}`)
        map.set(cat, (map.get(cat) ?? 0) + s.cost)
      }
      if (s.travel_cost) {
        const tc = t('budget.cat.Transport')
        map.set(tc, (map.get(tc) ?? 0) + s.travel_cost)
      }
    }
    for (const e of budgetEntries) {
      const cat = t(`budget.cat.${e.category}`)
      map.set(cat, (map.get(cat) ?? 0) + Number(e.amount))
    }
    const byCategory = [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    return { total: stopTotal + entriesTotal, byCategory }
  }, [stops, budgetEntries, placeMap, t])

  // Print / Save-as-PDF: a clean linear document (hidden on screen) is revealed by the
  // print stylesheet, then we open the browser's print dialog.
  function printItinerary() {
    if (printDays.length === 0) return
    window.print()
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

  // Per-day reference places (not on the route — added/dragged per day): dayId -> places.
  const refsByDay = useMemo(() => {
    const m = new Map<string, Place[]>()
    for (const r of dayRefs) {
      const p = placeMap.get(r.place_id)
      if (!p) continue
      const arr = m.get(r.day_id)
      if (arr) arr.push(p)
      else m.set(r.day_id, [p])
    }
    return m
  }, [dayRefs, placeMap])

  // The current day's reference places (located ones get a distance).
  const cursorDayId = byDate.get(cursor)?.day.id
  const cursorRefs = useMemo(
    () => (cursorDayId ? refsByDay.get(cursorDayId) ?? [] : []).filter((p) => p.lat != null && p.lng != null),
    [refsByDay, cursorDayId],
  )

  // Anchor for the day's "Nearby" distances = the stop you've selected, else the day's
  // first located stop.
  const anchorStop = useMemo(() => {
    const located = (byDate.get(cursor)?.stops ?? []).filter((s) => s.place.lat != null && s.place.lng != null)
    return located.find((s) => s.id === focusStopId) ?? located[0] ?? null
  }, [byDate, cursor, focusStopId])

  // Routed legs from the anchor stop to each reference place (cached in route_cache).
  // Mark fetched only AFTER storing (same self-healing pattern as the route-leg effect).
  const [refLegs, setRefLegs] = useState<Map<string, RouteLeg | null>>(new Map())
  const refFetched = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!anchorStop || cursorRefs.length === 0) return
    const o = { lat: anchorStop.place.lat as number, lng: anchorStop.place.lng as number }
    const need = cursorRefs
      .map((p) => {
        const d = { lat: p.lat as number, lng: p.lng as number }
        return { key: legKey(o, d), o, d }
      })
      .filter((n) => !refFetched.current.has(n.key))
    if (need.length === 0) return
    let cancelled = false
    void (async () => {
      const results = await Promise.all(need.map(async (n) => [n.key, await getRouteCached(n.o, n.d)] as const))
      if (cancelled) return
      setRefLegs((prev) => {
        const m = new Map(prev)
        for (const [k, leg] of results) m.set(k, leg)
        return m
      })
      for (const [k] of results) refFetched.current.add(k)
    })()
    return () => {
      cancelled = true
    }
  }, [anchorStop, cursorRefs])

  // Add / remove a reference place for a day (plain functions like addStopToDay, so
  // ensureDay always closes over the current `days`).
  async function addReference(iso: string, placeId: string) {
    const dayId = await ensureDay(iso)
    if (!dayId) return
    const { error } = await supabase.from('day_references').insert({ day_id: dayId, place_id: placeId })
    // Ignore the unique-violation when it's already a reference; surface anything else.
    if (error && error.code !== '23505') {
      toast.error(t('common.saveFailed'))
      return
    }
    await load()
  }
  async function removeReference(dayId: string, placeId: string) {
    const { error } = await supabase.from('day_references').delete().eq('day_id', dayId).eq('place_id', placeId)
    if (error) toast.error(t('common.deleteFailed'))
    else await load()
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
    let cancelled = false
    void (async () => {
      const results = await Promise.all(need.map(async (n) => [n.key, await getRouteCached(n.o, n.d)] as const))
      if (cancelled) return
      setRouteLegs((prev) => {
        const m = new Map(prev)
        for (const [key, leg] of results) m.set(key, leg)
        return m
      })
      // Mark as fetched only AFTER the results are stored. Marking before the fetch
      // meant that if byDate changed again mid-flight (e.g. adding a stop fires an
      // explicit reload plus a debounced realtime reload), this run was cancelled but
      // its keys stayed "fetched" — so the new leg's time/distance never loaded until
      // the board remounted (a tab switch). Marking here keeps it self-healing.
      for (const [key] of results) fetchedRef.current.add(key)
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
  const persistOrder = useCallback(
    async (dayId: string, stopIds: string[]) => {
      const results = await Promise.all(
        stopIds.map((id, i) => supabase.from('stops').update({ day_id: dayId, sort_order: i }).eq('id', id)),
      )
      if (results.some((r) => r.error)) toast.error(t('common.saveFailed'))
    },
    [toast, t],
  )

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
      toast.error(t('common.saveFailed'))
      return null
    }
    return data.id
  }

  // Tap-to-add (mobile-friendly alternative to drag): append a place to a day's route.
  async function addStopToDay(iso: string, placeId: string) {
    const dayId = await ensureDay(iso)
    if (!dayId) return
    const prefillCost = placeMap.get(placeId)?.est_cost ?? null
    const nextOrder = byDate.get(iso)?.stops.length ?? 0
    const { error } = await supabase
      .from('stops')
      .insert({ day_id: dayId, place_id: placeId, sort_order: nextOrder, cost: prefillCost })
    if (error) {
      toast.error(t('common.saveFailed'))
      return
    }
    return load()
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
    const overId = String(over.id)

    // Drop a palette place onto a day's reference zone → add it as a reference for that
    // day (NOT a route stop). Reference rows aren't draggable, so only `place:` matters.
    if (overId.startsWith('dayref:') && activeId.startsWith('place:')) {
      await addReference(overId.slice(7), activeId.slice(6))
      return
    }

    const dest = resolveDrop(overId)

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
      if (error) {
        toast.error(t('common.saveFailed'))
        return
      }
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
        const { error } = await supabase.from('stops').delete().eq('id', stopId)
        if (error) toast.error(t('common.deleteFailed'))
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
    if (error) toast.error(t('common.saveFailed'))
    else load()
  }
  async function setDayArea(iso: string, areaId: string | null) {
    const dayId = await ensureDay(iso)
    if (!dayId) return
    const { error } = await supabase.from('days').update({ area_id: areaId }).eq('id', dayId)
    if (error) toast.error(t('common.saveFailed'))
    else load()
  }
  async function setDayNote(iso: string, note: string) {
    const dayId = await ensureDay(iso)
    if (!dayId) return
    const { error } = await supabase.from('days').update({ note: note.trim() || null }).eq('id', dayId)
    if (error) toast.error(t('common.saveFailed'))
    else load()
  }
  async function clearDay(bd: BoardDay) {
    if (!confirm(t('itin.confirmClearDay', { day: formatDayLabel(bd.day.date, locale) }))) return
    const { error } = await supabase.from('days').delete().eq('id', bd.day.id) // cascades its stops
    if (error) toast.error(t('common.deleteFailed'))
    else load()
  }

  // Move a day (and all its stops, since they reference day_id) to a different
  // calendar date. Fixes the "I built routes under the wrong date" case. If a day
  // already exists on the target date, surface a clear error instead of silently
  // merging (uniqueness isn't enforced in SQL, but two days for the same date would
  // confuse byDate and the views).
  async function changeDayDate(fromIso: string, toIso: string) {
    if (toIso === fromIso) return
    const src = days.find((d) => d.date === fromIso)
    if (!src) return
    if (days.some((d) => d.date === toIso)) {
      toast.error(t('itin.dateChangeCollision', { date: toIso }))
      return
    }
    const { error } = await supabase.from('days').update({ date: toIso }).eq('id', src.id)
    if (error) toast.error(t('common.saveFailed'))
    else {
      await load()
      // Follow the day to its new date so the user lands on the same content.
      setCursor(toIso)
      toast.success(t('common.saved'))
    }
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
              <span className="print-group">
                <button
                  className="secondary cal-export"
                  onClick={printItinerary}
                  disabled={printDays.length === 0}
                  title={t('itin.printHint')}
                >
                  {t('itin.print')}
                </button>
                <span className="print-opts">
                  <span className="muted small">{t('itin.printInclude')}</span>
                  {([
                    ['notes', 'itin.printNotes'],
                    ['budget', 'itin.printBudget'],
                    ['packing', 'itin.printPacking'],
                    ['dayCosts', 'itin.printDayCosts'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="print-opt">
                      <input
                        type="checkbox"
                        checked={printOpts[key]}
                        onChange={(e) => setPrintOpts((o) => ({ ...o, [key]: e.target.checked }))}
                      />
                      {t(label)}
                    </label>
                  ))}
                </span>
              </span>
            </div>

            {view === 'month' && (
              <MonthView
                cursor={cursor}
                byDate={byDate}
                weatherByDate={weatherByDate}
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
                    weather={weatherByDate.get(iso)}
                    areas={areas}
                    inTrip={inTrip(iso)}
                    variant="week"
                    isToday={iso === todayIso}
                    onAreaChange={(areaId) => setDayArea(iso, areaId)}
                    onNoteChange={(note) => setDayNote(iso, note)}
                    onClear={byDate.get(iso) ? () => clearDay(byDate.get(iso)!) : undefined}
                    onChangeDate={byDate.get(iso) ? (newIso) => changeDayDate(iso, newIso) : undefined}
                    onOpenDay={() => {
                      setCursor(iso)
                      setView('day')
                    }}
                    routeLegs={routeLegs}
                    places={places}
                    onAddStop={(placeId) => addStopToDay(iso, placeId)}
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
                  weather={weatherByDate.get(cursor)}
                  areas={areas}
                  inTrip={inTrip(cursor)}
                  variant="day"
                  isToday={cursor === todayIso}
                  onAreaChange={(areaId) => setDayArea(cursor, areaId)}
                  onNoteChange={(note) => setDayNote(cursor, note)}
                  onClear={byDate.get(cursor) ? () => clearDay(byDate.get(cursor)!) : undefined}
                  onChangeDate={byDate.get(cursor) ? (newIso) => changeDayDate(cursor, newIso) : undefined}
                  onFocusStop={focusStop}
                  routeLegs={routeLegs}
                  places={places}
                  onAddStop={(placeId) => addStopToDay(cursor, placeId)}
                  onStopChange={load}
                />
                <div className="day-side">
                  <ItineraryDayMap
                    iso={cursor}
                    stops={byDate.get(cursor)?.stops ?? []}
                    references={cursorRefs}
                    focus={focusPoint}
                    selectedId={focusStopId}
                  />
                  <NearbyPanel
                    iso={cursor}
                    anchor={anchorStop}
                    references={cursorRefs}
                    allPlaces={places}
                    refLegs={refLegs}
                    onAdd={(placeId) => addReference(cursor, placeId)}
                    onRemove={(placeId) => cursorDayId && removeReference(cursorDayId, placeId)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DragOverlay>{activeLabel ? <div className="drag-overlay">{activeLabel}</div> : null}</DragOverlay>
      </DndContext>

      <PrintItinerary
        tripName={tripName}
        currency={currency}
        notes={notes}
        startDate={startDate}
        endDate={endDate}
        days={printDays}
        areas={areas}
        weatherByDate={weatherByDate}
        routeLegs={routeLegs}
        budget={budget}
        entries={budgetEntries}
        packing={packing}
        opts={printOpts}
        locale={locale}
      />
    </div>
  )
}

// A clean, linear, read-only version of the itinerary for print / Save-as-PDF. Hidden
// on screen (the print stylesheet reveals it), so it never affects the live board.
function PrintItinerary({
  tripName,
  currency,
  notes,
  startDate,
  endDate,
  days,
  areas,
  weatherByDate,
  routeLegs,
  budget,
  entries,
  packing,
  opts,
  locale,
}: {
  tripName: string
  currency: string
  notes: string | null
  startDate: string | null
  endDate: string | null
  days: BoardDay[]
  areas: Area[]
  weatherByDate: Map<string, DayWeather>
  routeLegs: Map<string, RouteLeg | null>
  budget: { total: number; byCategory: [string, number][] }
  entries: BudgetEntry[]
  packing: PackingItem[]
  opts: { notes: boolean; budget: boolean; packing: boolean; dayCosts: boolean }
  locale: string
}) {
  const { t } = useT()
  const areaName = (id: string | null) => areas.find((a) => a.id === id)?.name ?? null
  // A day's total cost: per-stop + per-leg costs, plus budget entries tied to that day.
  const dayTotal = (bd: BoardDay) =>
    bd.stops.reduce((s, x) => s + (x.cost ?? 0) + (x.travel_cost ?? 0), 0) +
    entries.filter((e) => e.day_id === bd.day.id).reduce((s, e) => s + Number(e.amount), 0)
  const dateRange =
    startDate && endDate ? `${formatDayLabel(startDate, locale)} – ${formatDayLabel(endDate, locale)}` : null

  // A compact travel line between two consecutive stops (mode · distance · time · cost).
  function legLine(prev: BoardStop, cur: BoardStop): string | null {
    const located =
      prev.place.lat != null && prev.place.lng != null && cur.place.lat != null && cur.place.lng != null
    let autoMins: number | null = null
    let autoMeters: number | null = null
    if (located) {
      const leg = routeLegs.get(
        legKey({ lat: prev.place.lat!, lng: prev.place.lng! }, { lat: cur.place.lat!, lng: cur.place.lng! }),
      )
      if (leg) {
        autoMins = Math.round(leg.durationSeconds / 60)
        autoMeters = leg.distanceMeters
      }
    }
    const mins = cur.travel_min ?? autoMins
    const meters = cur.travel_dist_m ?? autoMeters
    const parts: string[] = [modeIcon(cur.travel_mode)]
    if (meters != null) parts.push(formatKm(meters))
    if (mins != null) parts.push(`${mins} min`)
    if (cur.travel_cost != null && cur.travel_cost > 0) parts.push(`💰 ${formatMoney(cur.travel_cost, currency, locale)}`)
    if (cur.travel_note) parts.push(`📝 ${cur.travel_note}`)
    return parts.length > 1 ? parts.join(' · ') : null
  }

  return (
    <div className="print-itinerary" aria-hidden="true">
      <header className="print-head">
        <h1>{tripName}</h1>
        {dateRange && <p>{dateRange}</p>}
      </header>

      {days.map((bd) => {
        const an = areaName(bd.day.area_id)
        const w = weatherByDate.get(bd.day.date)
        const dt = dayTotal(bd)
        return (
          <section className="print-day" key={bd.day.id}>
            <h2>
              {formatDayLabel(bd.day.date, locale)}
              {an && <span className="print-area"> · {an}</span>}
              {w && (
                <span className="print-weather">
                  {' · '}
                  {w.kind === 'normal' ? normalEmoji(w.precipMm ?? 0) : weatherMeta(w.code ?? 0).emoji}{' '}
                  {w.kind === 'normal' ? '≈' : ''}
                  {w.tMax}°/{w.tMin}°
                </span>
              )}
              {opts.dayCosts && dt > 0 && (
                <span className="print-area"> · 💰 {formatMoney(dt, currency, locale)}</span>
              )}
            </h2>
            {bd.day.note && <p className="print-day-note">📝 {bd.day.note}</p>}
            <ol className="print-stops">
              {bd.stops.map((s, i) => {
                const meta = categoryMeta(s.place.category)
                const line = i > 0 ? legLine(bd.stops[i - 1], s) : null
                const metaBits: string[] = []
                if (s.duration_min != null) metaBits.push(`⏱ ${s.duration_min} min`)
                if (s.cost != null) metaBits.push(`💰 ${formatMoney(s.cost, currency, locale)}`)
                if (s.place.city) metaBits.push(s.place.city)
                return (
                  <li className="print-stop" key={s.id}>
                    {line && <div className="print-leg">↓ {line}</div>}
                    <div className="print-stop-head">
                      <span className="print-time">{s.arrival_time ? s.arrival_time.slice(0, 5) : '—'}</span>
                      <span className="print-name">
                        {meta.emoji} {s.place.name}
                      </span>
                    </div>
                    {metaBits.length > 0 && <div className="print-stop-meta">{metaBits.join(' · ')}</div>}
                    {s.place.notes && <div className="print-stop-notes">{s.place.notes}</div>}
                    {s.place.dietary_notes && <div className="print-stop-notes">🍽 {s.place.dietary_notes}</div>}
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}

      {(() => {
        const showNotes = opts.notes && !!notes
        const showBudget = opts.budget && budget.byCategory.length > 0
        const showPacking = opts.packing && packing.length > 0
        if (!showNotes && !showBudget && !showPacking) return null
        // The extras start on a fresh page so they don't crowd the last day.
        return (
          <div className="print-extras">
            {showNotes && (
              <section className="print-day print-extra">
                <h2>{t('notes.title')}</h2>
                <p className="print-notes-body">{notes}</p>
              </section>
            )}
            {showBudget && (
              <section className="print-day print-extra">
                <h2>
                  {t('budget.total')}: {formatMoney(budget.total, currency, locale)}
                </h2>
                <ul className="print-budget">
                  {budget.byCategory.map(([cat, amount]) => (
                    <li key={cat}>
                      <span>{cat}</span>
                      <span>{formatMoney(amount, currency, locale)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {showPacking && (
              <section className="print-day print-extra">
                <h2>{t('packing.title')}</h2>
                <ul className="print-packing">
                  {packing.map((p) => (
                    <li key={p.id}>
                      {p.packed ? '☑' : '☐'} {p.label}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )
      })()}

      <footer className="print-foot">{t('itin.printFooter')}</footer>
    </div>
  )
}

// Small weather badge shown on day panels and month cells. A real forecast shows the
// WMO emoji + temps; a climate normal (planning ahead) shows a "≈" + a "typical for
// this time of year" tooltip so it's never mistaken for an actual forecast.
function WeatherChip({ weather, compact }: { weather: DayWeather; compact?: boolean }) {
  const { t } = useT()
  const isNormal = weather.kind === 'normal'
  const emoji = isNormal ? normalEmoji(weather.precipMm ?? 0) : weatherMeta(weather.code ?? 0).emoji
  const label = isNormal ? t('weather.typical') : t(`weather.${weatherMeta(weather.code ?? 0).key}`)
  const temps = `${weather.tMax}°/${weather.tMin}°`
  const title = `${label} · ${weather.tMax}° / ${weather.tMin}°${
    isNormal && weather.precipMm ? ` · ~${weather.precipMm}mm` : ''
  }`
  return (
    <span className={`weather-chip${compact ? ' compact' : ''}${isNormal ? ' normal' : ''}`} title={title}>
      <span aria-hidden="true">{emoji}</span>
      <span className="weather-temp">
        {isNormal ? '≈' : ''}
        {compact ? `${weather.tMax}°` : temps}
      </span>
    </span>
  )
}

// --- Month view ----------------------------------------------------------
function MonthView({
  cursor,
  byDate,
  weatherByDate,
  inTrip,
  todayIso,
  onOpenDay,
}: {
  cursor: string
  byDate: Map<string, BoardDay>
  weatherByDate: Map<string, DayWeather>
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
            weather={weatherByDate.get(iso)}
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
  weather,
  dim,
  isToday,
  onOpen,
}: {
  iso: string
  boardDay?: BoardDay
  weather?: DayWeather
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
      <div className="month-cell-date">
        <span>{dayOfMonth(iso)}{isToday && <span className="today-dot" />}</span>
        {weather && <WeatherChip weather={weather} compact />}
      </div>
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
  weather,
  areas,
  inTrip,
  variant,
  isToday,
  routeLegs,
  places,
  onAddStop,
  onAreaChange,
  onNoteChange,
  onClear,
  onChangeDate,
  onOpenDay,
  onFocusStop,
  onStopChange,
}: {
  iso: string
  boardDay?: BoardDay
  weather?: DayWeather
  areas: Area[]
  inTrip: boolean
  variant: 'week' | 'day'
  isToday?: boolean
  routeLegs: Map<string, RouteLeg | null>
  places: Place[]
  onAddStop: (placeId: string) => void
  onAreaChange: (areaId: string | null) => void
  onNoteChange: (note: string) => void
  onClear?: () => void
  onChangeDate?: (newIso: string) => void
  onOpenDay?: () => void
  onFocusStop?: (s: BoardStop) => void
  onStopChange: () => void
}) {
  const { t, locale } = useT()
  const { setNodeRef, isOver } = useDroppable({ id: `date:${iso}` })
  const [adding, setAdding] = useState(false)
  const stops = boardDay?.stops ?? []

  // The travel leg arriving into each stop (auto OSRM values + any per-stop
  // overrides), plus a running total of travel minutes for the busy-day flag.
  let travelMin = 0
  const legs = stops.map((s, i): Leg | null => {
    if (i === 0) return null
    const prev = stops[i - 1]
    const locMissing =
      prev.place.lat == null || prev.place.lng == null || s.place.lat == null || s.place.lng == null
    let autoMins: number | null = null
    let autoMeters: number | null = null
    let loading = false
    let noRoute = false
    if (!locMissing) {
      const leg = routeLegs.get(
        legKey({ lat: prev.place.lat!, lng: prev.place.lng! }, { lat: s.place.lat!, lng: s.place.lng! }),
      )
      if (leg === undefined) loading = true
      else if (leg === null) noRoute = true
      else {
        autoMins = Math.round(leg.durationSeconds / 60)
        autoMeters = leg.distanceMeters
      }
    }
    const mins = s.travel_min ?? autoMins
    const meters = s.travel_dist_m ?? autoMeters
    if (mins != null) travelMin += mins
    return {
      mode: s.travel_mode,
      note: s.travel_note,
      cost: s.travel_cost,
      autoMins,
      autoMeters,
      mins,
      meters,
      overridden:
        s.travel_min != null || s.travel_dist_m != null || s.travel_mode != null || s.travel_cost != null,
      loading,
      noRoute,
      locMissing,
    }
  })

  // Per-stop time-consistency warning: a time earlier than the previous stop
  // (order looks wrong), or not enough time to leave the previous stop, drive over,
  // and arrive by this stop's set time.
  const timeWarnings = stops.map((s, i): TimeWarning | null => {
    if (i === 0) return null
    const prev = stops[i - 1]
    const curMin = timeToMin(s.arrival_time)
    const prevMin = timeToMin(prev.arrival_time)
    if (curMin == null || prevMin == null) return null
    if (curMin < prevMin) return { kind: 'order' }
    const legMins = legs[i]?.mins ?? 0
    const earliest = prevMin + (prev.duration_min ?? 0) + legMins
    if (earliest > curMin) return { kind: 'tight', shortBy: earliest - curMin }
    return null
  })

  const visitMin = stops.reduce((sum, s) => sum + (s.duration_min ?? 0), 0)
  const busy = travelMin > 300 || travelMin + visitMin > 720

  return (
    <div className={`day-panel ${variant}${isOver ? ' over' : ''}${inTrip ? '' : ' out-of-trip'}${isToday ? ' today' : ''}`}>
      <div className="day-head">
        <span className="day-head-left">
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
          {weather && <WeatherChip weather={weather} />}
        </span>
        <span className="day-head-right">
          {busy && <span className="busy-flag" title={t('itin.busyTitle')}>{t('itin.busy')}</span>}
          {travelMin > 0 && (
            <span className="muted small" title={t('itin.travel')}>
              🧭 <bdi dir="ltr">{formatTravelTotal(travelMin)}</bdi> {t('itin.travel')}
            </span>
          )}
          {onChangeDate && boardDay && (
            <ChangeDayDate iso={iso} onChange={onChangeDate} />
          )}
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
              leg={legs[i]}
              timeWarning={timeWarnings[i]}
              onFocus={onFocusStop ? () => onFocusStop(s) : undefined}
              onChange={onStopChange}
            />
          ))}
        </SortableContext>
        {stops.length === 0 && <p className="muted small empty-day">{t('itin.dropHere')}</p>}
      </div>
      <button className="secondary add-stop-btn" onClick={() => setAdding((a) => !a)}>
        {adding ? t('common.cancel') : t('itin.addStop')}
      </button>
      {adding && (
        <AddStopPicker
          places={places}
          onPick={(placeId) => {
            onAddStop(placeId)
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

// Tap-to-add place picker (mobile-friendly alternative to dragging from the palette).
function AddStopPicker({ places, onPick }: { places: Place[]; onPick: (placeId: string) => void }) {
  const { t } = useT()
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const filtered = query
    ? places.filter((p) => p.name.toLowerCase().includes(query))
    : places
  return (
    <div className="add-stop-picker">
      <input
        className="add-stop-search"
        autoFocus
        placeholder={t('itin.addSearch')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {places.length === 0 ? (
        <p className="muted small">{t('itin.paletteEmpty')}</p>
      ) : (
        <ul className="add-stop-list">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                className="place-row"
                onClick={() => onPick(p.id)}
                style={{ borderInlineStartColor: placeColor(p.category, p.color), borderInlineStartWidth: 3 }}
              >
                <span className="place-emoji">{categoryMeta(p.category).emoji}</span>
                <span className="place-row-name">{p.name}</span>
                {p.city && <span className="muted small">{p.city}</span>}
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="muted small">{t('places.noneMatch')}</li>}
        </ul>
      )}
    </div>
  )
}

// Small inline date picker on a day header: a 📅 button reveals a native date input.
// Lets the user move a whole day (and its stops) to a different calendar date — fixing
// the "I built routes under the wrong date" case without forcing them to re-drag every
// stop. The picker auto-closes after a change or on outside click.
function ChangeDayDate({ iso, onChange }: { iso: string; onChange: (newIso: string) => void }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])
  return (
    <span className="day-date-change">
      <button
        type="button"
        className="linklike"
        title={t('itin.changeDate')}
        aria-label={t('itin.changeDate')}
        onClick={() => setOpen((v) => !v)}
      >
        📅
      </button>
      {open && (
        <input
          ref={inputRef}
          type="date"
          defaultValue={iso}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            const v = e.target.value
            if (v && v !== iso) onChange(v)
            setOpen(false)
          }}
        />
      )}
    </span>
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

const REFERENCE_COLOR = '#dc2626' // red — reference places (hospital/police/…) stand out

function escapeHtmlItin(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

function ItineraryDayMap({
  iso,
  stops,
  references,
  focus,
  selectedId,
}: {
  iso: string
  stops: BoardStop[]
  references: Place[]
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
  // Reference places (not on the route) shown as distinct red pins for context.
  for (const p of references) {
    if (p.lat == null || p.lng == null) continue
    markers.push({
      id: `ref:${p.id}`,
      position: { lat: p.lat, lng: p.lng },
      category: p.category,
      color: REFERENCE_COLOR,
      label: p.name,
      popup: `<div class="map-popup"><strong>${categoryMeta(p.category).emoji} ${escapeHtmlItin(p.name)}</strong>${
        p.phone ? `<div>📞 ${escapeHtmlItin(p.phone)}</div>` : ''
      }</div>`,
    })
  }

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

// Straight-line distance (km) — used to sort reference places and as a fallback label
// while the routed leg is still loading.
function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Per-day "Nearby" panel: a drop zone (drag a palette place in) + an "Add reference"
// picker, listing each reference place with the routed distance/time from the selected
// stop, a tap-to-call phone, and notes — sorted nearest-first. Each row has a remove ×.
function NearbyPanel({
  iso,
  anchor,
  references,
  allPlaces,
  refLegs,
  onAdd,
  onRemove,
}: {
  iso: string
  anchor: BoardStop | null
  references: Place[]
  allPlaces: Place[]
  refLegs: Map<string, RouteLeg | null>
  onAdd: (placeId: string) => void
  onRemove: (placeId: string) => void
}) {
  const { t } = useT()
  // The drop-zone id carries the ISO date (addReference → ensureDay takes a date).
  const { setNodeRef, isOver } = useDroppable({ id: `dayref:${iso}` })
  const refIds = new Set(references.map((p) => p.id))
  // Eligible to add: any located trip place not already a reference of this day.
  const addable = allPlaces.filter((p) => p.lat != null && p.lng != null && !refIds.has(p.id))

  const origin = anchor ? { lat: anchor.place.lat as number, lng: anchor.place.lng as number } : null
  const rows = references
    .map((p) => {
      const dest = { lat: p.lat as number, lng: p.lng as number }
      const km = origin ? haversineKm(origin, dest) : null
      const leg = origin ? refLegs.get(legKey(origin, dest)) : null
      return { p, km, leg }
    })
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))

  return (
    <div ref={setNodeRef} className={`nearby-panel card${isOver ? ' over' : ''}`}>
      <div className="wishlist-head">
        <span>{t('itin.nearbyTitle')}</span>
        {anchor && references.length > 0 && (
          <span className="muted small">{t('itin.nearbyFrom', { name: anchor.place.name })}</span>
        )}
      </div>

      {references.length === 0 && <p className="muted small">{t('itin.nearbyEmpty')}</p>}
      {references.length > 0 && !anchor && <p className="muted small">{t('itin.nearbyNoAnchor')}</p>}

      <ul className="place-list">
        {rows.map(({ p, km, leg }) => (
          <li key={p.id}>
            <div className="nearby-row">
              <span className="place-emoji">{categoryMeta(p.category).emoji}</span>
              <span className="nearby-name">{p.name}</span>
              <span className="nearby-dist">
                <bdi dir="ltr">
                  {!anchor
                    ? '—'
                    : leg === undefined
                      ? '…'
                      : leg
                        ? `🚗 ${Math.round(leg.durationSeconds / 60)} min · ${formatKm(leg.distanceMeters)}`
                        : km != null
                          ? `~${km.toFixed(1)} km`
                          : t('itin.noRoute')}
                </bdi>
              </span>
              <button
                className="linklike danger"
                onClick={() => onRemove(p.id)}
                aria-label={t('itin.refRemove', { name: p.name })}
                title={t('itin.refRemove', { name: p.name })}
              >
                ×
              </button>
            </div>
            {(p.phone || p.notes) && (
              <div className="nearby-meta">
                {p.phone && (
                  <a className="nearby-phone" href={`tel:${p.phone.replace(/\s+/g, '')}`}>
                    📞 {p.phone}
                  </a>
                )}
                {p.notes && <span className="muted small">{p.notes}</span>}
              </div>
            )}
          </li>
        ))}
      </ul>

      {addable.length > 0 && (
        <select
          className="nearby-add"
          value=""
          aria-label={t('itin.refAdd')}
          onChange={(e) => {
            if (e.target.value) onAdd(e.target.value)
          }}
        >
          <option value="">{t('itin.refAdd')}</option>
          {addable.map((p) => (
            <option key={p.id} value={p.id}>
              {categoryMeta(p.category).emoji} {p.name}
            </option>
          ))}
        </select>
      )}
      <p className="muted small">{t('itin.refDropHint')}</p>
    </div>
  )
}

// "HH:MM[:SS]" -> minutes since midnight, or null if unset/invalid.
function timeToMin(value?: string | null): number | null {
  if (!value) return null
  const [h, m] = value.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

type TimeWarning = { kind: 'order' | 'tight'; shortBy?: number }

const TRAVEL_MODES = [
  { key: 'walk', icon: '🚶' },
  { key: 'car', icon: '🚗' },
  { key: 'train', icon: '🚆' },
  { key: 'bus', icon: '🚌' },
  { key: 'bike', icon: '🚲' },
  { key: 'other', icon: '➡️' },
] as const

function modeIcon(mode?: string | null): string {
  return TRAVEL_MODES.find((m) => m.key === mode)?.icon ?? '🚗'
}

function legText(leg: Leg, t: (k: string, v?: Record<string, string | number>) => string): string {
  // Cost is independent of routing — always append it, even when the time/route is
  // missing or still loading, or a saved leg cost looks like it didn't save.
  const price = leg.cost != null && leg.cost > 0 ? ` · 💰 ${leg.cost}` : ''
  if (leg.locMissing) return `${t('itin.locationMissing')}${price}`
  if (leg.mins == null) {
    if (leg.loading) return `…${price}`
    if (leg.noRoute) return `${t('itin.noRoute')}${price}`
    return `—${price}`
  }
  const dist = leg.meters != null ? `${formatKm(leg.meters)} · ` : ''
  return `${dist}${leg.mins} min${price}`
}

// A travel leg arriving into a stop: auto OSRM values + any per-stop overrides.
interface Leg {
  mode: string | null
  note: string | null
  cost: number | null
  autoMins: number | null
  autoMeters: number | null
  mins: number | null // override ?? auto
  meters: number | null // override ?? auto
  overridden: boolean
  loading: boolean
  noRoute: boolean
  locMissing: boolean
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
  const [cat, setCat] = useState<PlaceCategory | 'all'>('all')
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const filtered = places.filter(
    (p) => (cat === 'all' || p.category === cat) && (!query || p.name.toLowerCase().includes(query)),
  )
  return (
    <div ref={setNodeRef} className={`wishlist-col${isOver ? ' over' : ''}`}>
      <div className="wishlist-head">
        <span>{t('itin.palettePlaces')}</span>
        <span className="muted">
          {filtered.length}
          {filtered.length !== places.length ? ` / ${places.length}` : ''}
        </span>
      </div>

      {places.length > 6 && (
        <div className="palette-filters">
          <input
            className="palette-search"
            value={q}
            placeholder={t('itin.addSearch')}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="cat-chips">
            <button
              type="button"
              className={`cat-chip${cat === 'all' ? ' active' : ''}`}
              onClick={() => setCat('all')}
            >
              {t('places.allCategories')}
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`cat-chip${cat === c.key ? ' active' : ''}`}
                title={t(`cat.${c.key}`)}
                aria-label={t(`cat.${c.key}`)}
                onClick={() => setCat(cat === c.key ? 'all' : c.key)}
              >
                {c.emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {places.length === 0 && <p className="muted small">{t('itin.paletteEmpty')}</p>}
      {places.length > 0 && filtered.length === 0 && <p className="muted small">{t('places.noneMatch')}</p>}
      <div className="palette-list">
        {filtered.map((p) => (
          <PaletteItem key={p.id} place={p} count={counts.get(p.id) ?? 0} />
        ))}
      </div>
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
  leg,
  timeWarning,
  onFocus,
  onChange,
}: {
  stop: BoardStop
  leg: Leg | null
  timeWarning?: TimeWarning | null
  onFocus?: () => void
  onChange: () => void
}) {
  const { t } = useT()
  const toast = useToast()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `stop:${stop.id}`,
  })
  const meta = categoryMeta(stop.place.category)
  const [time, setTime] = useState(stop.arrival_time?.slice(0, 5) ?? '')
  const [dur, setDur] = useState(stop.duration_min?.toString() ?? '')
  const [cost, setCost] = useState(stop.cost?.toString() ?? '')
  const [reminder, setReminder] = useState(stop.reminder_min != null ? String(stop.reminder_min) : '')
  const [editingLeg, setEditingLeg] = useState(false)

  async function commit(patch: {
    arrival_time?: string | null
    duration_min?: number | null
    cost?: number | null
    reminder_min?: number | null
    travel_mode?: string | null
    travel_min?: number | null
    travel_dist_m?: number | null
    travel_note?: string | null
    travel_cost?: number | null
  }) {
    const { error } = await supabase.from('stops').update(patch).eq('id', stop.id)
    if (error) toast.error(t('common.saveFailed'))
    else onChange()
  }
  async function remove() {
    const { error } = await supabase.from('stops').delete().eq('id', stop.id)
    if (error) toast.error(t('common.deleteFailed'))
    else onChange()
  }

  return (
    <div
      ref={setNodeRef}
      className="stop-wrap"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {leg && (
        <div className="stop-connector">
          <span className="connector-line" />
          <button
            type="button"
            className={`connector-btn${leg.overridden ? ' overridden' : ''}`}
            onClick={() => setEditingLeg((v) => !v)}
            title={t('itin.legEdit')}
          >
            {/* Numbers + units are LTR data; isolate so they don't reorder under RTL. */}
            <bdi dir="ltr">{modeIcon(leg.mode)} {legText(leg, t)}</bdi>
            {leg.note && <span title={leg.note}> 📝</span>}
          </button>
        </div>
      )}
      {leg && editingLeg && (
        <LegEditor
          autoMins={leg.autoMins}
          autoMeters={leg.autoMeters}
          initMode={stop.travel_mode}
          initMin={stop.travel_min}
          initDistM={stop.travel_dist_m}
          initNote={stop.travel_note}
          initCost={stop.travel_cost}
          onSave={(patch) => {
            commit(patch)
            setEditingLeg(false)
          }}
          onClose={() => setEditingLeg(false)}
        />
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
        {timeWarning && (
          <span
            className="time-warn"
            title={
              timeWarning.kind === 'order'
                ? t('itin.timeOrderHint')
                : t('itin.timeTightHint', { min: timeWarning.shortBy ?? 0 })
            }
          >
            {timeWarning.kind === 'order' ? t('itin.timeOrder') : t('itin.timeTight', { min: timeWarning.shortBy ?? 0 })}
          </span>
        )}
      </div>
      <button className="linklike danger" onClick={remove} title={t('itin.removeFromDay')} aria-label={t('itin.removeFromDay')}>×</button>
      </div>
    </div>
  )
}

// Inline editor for the travel leg arriving into a stop: mode, manual time/distance
// (overriding the auto OSRM values shown as placeholders), and a per-leg note.
function LegEditor({
  autoMins,
  autoMeters,
  initMode,
  initMin,
  initDistM,
  initNote,
  initCost,
  onSave,
  onClose,
}: {
  autoMins: number | null
  autoMeters: number | null
  initMode: string | null
  initMin: number | null
  initDistM: number | null
  initNote: string | null
  initCost: number | null
  onSave: (patch: {
    travel_mode: string | null
    travel_min: number | null
    travel_dist_m: number | null
    travel_note: string | null
    travel_cost: number | null
  }) => void
  onClose: () => void
}) {
  const { t } = useT()
  const [mode, setMode] = useState(initMode ?? '')
  const [min, setMin] = useState(initMin != null ? String(initMin) : '')
  const [distKm, setDistKm] = useState(initDistM != null ? String(initDistM / 1000) : '')
  const [note, setNote] = useState(initNote ?? '')
  const [cost, setCost] = useState(initCost != null ? String(initCost) : '')

  return (
    <div className="leg-editor">
      <div className="leg-modes">
        {TRAVEL_MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`mode-chip${mode === m.key ? ' active' : ''}`}
            title={t(`itin.mode.${m.key}`)}
            aria-label={t(`itin.mode.${m.key}`)}
            aria-pressed={mode === m.key}
            onClick={() => setMode(mode === m.key ? '' : m.key)}
          >
            {m.icon}
          </button>
        ))}
      </div>
      <div className="leg-fields">
        <label>
          {t('itin.legDuration')}
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={min}
            placeholder={autoMins != null ? String(autoMins) : ''}
            onChange={(e) => setMin(e.target.value)}
          />
        </label>
        <label>
          {t('itin.legDistance')}
          <input
            type="number"
            min="0"
            inputMode="decimal"
            value={distKm}
            placeholder={autoMeters != null ? (autoMeters / 1000).toFixed(1) : ''}
            onChange={(e) => setDistKm(e.target.value)}
          />
        </label>
        <label>
          {t('itin.legCost')}
          <input
            type="number"
            min="0"
            inputMode="decimal"
            value={cost}
            placeholder="0"
            onChange={(e) => setCost(e.target.value)}
          />
        </label>
      </div>
      <input
        className="leg-note-input"
        value={note}
        placeholder={t('itin.legNote')}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="button-row">
        <button
          onClick={() =>
            onSave({
              travel_mode: mode || null,
              travel_min: min.trim() === '' ? null : Number(min),
              travel_dist_m: distKm.trim() === '' ? null : Math.round(Number(distKm) * 1000),
              travel_note: note.trim() || null,
              travel_cost: cost.trim() === '' ? null : Number(cost),
            })
          }
        >
          {t('common.save')}
        </button>
        <button
          className="secondary"
          onClick={() =>
            onSave({
              travel_mode: null,
              travel_min: null,
              travel_dist_m: null,
              travel_note: null,
              travel_cost: null,
            })
          }
        >
          {t('itin.legReset')}
        </button>
        <button className="linklike" onClick={onClose}>
          {t('common.close')}
        </button>
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
