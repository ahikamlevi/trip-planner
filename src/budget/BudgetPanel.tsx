import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useTripRealtime } from '../lib/useTripRealtime'
import { useT } from '../i18n/I18nProvider'
import type { BudgetEntry, Day, Place, Stop } from '../lib/database.types'
import { CATEGORIES } from '../places/categories'
import { formatDayLabel } from '../itinerary/dates'
import { formatMoney } from './money'

const ENTRY_CATEGORIES = ['Transport', 'Lodging', 'Food', 'Activities', 'Shopping', 'Fees', 'Other']

export function BudgetPanel({ tripId, currency }: { tripId: string; currency: string }) {
  const { t, locale } = useT()
  const [places, setPlaces] = useState<Place[]>([])
  const [days, setDays] = useState<Day[]>([])
  const [stops, setStops] = useState<Stop[]>([])
  const [entries, setEntries] = useState<BudgetEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [placesRes, daysRes, entriesRes] = await Promise.all([
      supabase.from('places').select('*').eq('trip_id', tripId),
      supabase.from('days').select('*').eq('trip_id', tripId).order('date'),
      supabase.from('budget_entries').select('*').eq('trip_id', tripId).order('created_at'),
    ])
    if (placesRes.error || daysRes.error || entriesRes.error) {
      setError(placesRes.error?.message ?? daysRes.error?.message ?? entriesRes.error?.message ?? null)
      setLoading(false)
      return
    }
    const dayRows = daysRes.data ?? []
    const dayIds = dayRows.map((d) => d.id)
    let stopRows: Stop[] = []
    if (dayIds.length) {
      const stopsRes = await supabase.from('stops').select('*').in('day_id', dayIds)
      if (!stopsRes.error) stopRows = stopsRes.data ?? []
    }
    setPlaces(placesRes.data ?? [])
    setDays(dayRows)
    setStops(stopRows)
    setEntries(entriesRes.data ?? [])
    setLoading(false)
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  useTripRealtime(tripId, load)

  const placeMap = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])

  const stopTotal = useMemo(
    () => stops.reduce((sum, s) => sum + (s.cost ?? 0) + (s.travel_cost ?? 0), 0),
    [stops],
  )
  const entriesTotal = useMemo(() => entries.reduce((sum, e) => sum + Number(e.amount), 0), [entries])
  const total = stopTotal + entriesTotal

  // Unified category breakdown: place-visit costs by place category + entries by
  // category. Keyed by the translated label so equivalent buckets merge.
  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of stops) {
      const cat = t(`cat.${placeMap.get(s.place_id)?.category ?? 'sight'}`)
      map.set(cat, (map.get(cat) ?? 0) + (s.cost ?? 0))
      // Travel-leg costs roll up under Transport.
      if (s.travel_cost) {
        const tc = t('budget.cat.Transport')
        map.set(tc, (map.get(tc) ?? 0) + s.travel_cost)
      }
    }
    for (const e of entries) {
      const cat = t(`budget.cat.${e.category}`)
      map.set(cat, (map.get(cat) ?? 0) + Number(e.amount))
    }
    return [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  }, [stops, entries, placeMap, t])

  const byDay = useMemo(
    () =>
      days.map((d) => {
        const sc = stops
          .filter((s) => s.day_id === d.id)
          .reduce((sum, s) => sum + (s.cost ?? 0) + (s.travel_cost ?? 0), 0)
        const ec = entries.filter((e) => e.day_id === d.id).reduce((sum, e) => sum + Number(e.amount), 0)
        return { day: d, total: sc + ec }
      }),
    [days, stops, entries],
  )

  const untied = useMemo(() => entries.filter((e) => !e.day_id), [entries])
  const untiedTotal = untied.reduce((sum, e) => sum + Number(e.amount), 0)
  const maxCat = byCategory.length ? byCategory[0][1] : 0

  async function addEntry(input: { category: string; amount: number; note: string | null; day_id: string | null }) {
    const { error } = await supabase.from('budget_entries').insert({
      trip_id: tripId,
      category: input.category,
      amount: input.amount,
      currency,
      note: input.note,
      day_id: input.day_id,
    })
    if (error) setError(error.message)
    else load()
  }

  async function deleteEntry(id: string) {
    if (!confirm(t('budget.confirmDelete'))) return
    await supabase.from('budget_entries').delete().eq('id', id)
    load()
  }

  if (loading) return <p className="muted">{t('budget.loading')}</p>

  return (
    <div className="budget">
      {error && <p className="auth-error">{error}</p>}

      <div className="budget-total card">
        <span className="muted">{t('budget.total')}</span>
        <span className="budget-total-amount">{formatMoney(total, currency, locale)}</span>
        <span className="muted small">
          {t('budget.breakdown', {
            stops: formatMoney(stopTotal, currency, locale),
            other: formatMoney(entriesTotal, currency, locale),
          })}
        </span>
      </div>

      <div className="budget-cols">
        <section className="card">
          <h3>{t('budget.byCategory')}</h3>
          {byCategory.length === 0 && <p className="muted small">{t('budget.noCosts')}</p>}
          {byCategory.map(([cat, amount]) => (
            <div key={cat} className="cat-row">
              <div className="cat-row-top">
                <span>{cat}</span>
                <span className="muted">{formatMoney(amount, currency, locale)}</span>
              </div>
              <div className="cat-bar">
                <div className="cat-bar-fill" style={{ width: `${maxCat ? (amount / maxCat) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </section>

        <section className="card">
          <h3>{t('budget.byDay')}</h3>
          {byDay.length === 0 && <p className="muted small">{t('budget.noDayCosts')}</p>}
          {byDay.map(({ day, total: dt }) => (
            <div key={day.id} className="day-cost-row">
              <span>{formatDayLabel(day.date, locale)}</span>
              <span className="muted">{formatMoney(dt, currency, locale)}</span>
            </div>
          ))}
          {untiedTotal > 0 && (
            <div className="day-cost-row">
              <span className="muted">{t('budget.notTiedToDay')}</span>
              <span className="muted">{formatMoney(untiedTotal, currency, locale)}</span>
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <h3>{t('budget.otherCosts')}</h3>
        <p className="muted small">{t('budget.otherCostsHint')}</p>
        <ul className="entry-list">
          {entries.map((e) => (
            <li key={e.id}>
              <span className="entry-cat">{t(`budget.cat.${e.category}`)}</span>
              <span className="entry-note muted">{e.note}</span>
              {e.day_id && (
                <span className="muted small">
                  {days.find((d) => d.id === e.day_id)
                    ? formatDayLabel(days.find((d) => d.id === e.day_id)!.date, locale)
                    : ''}
                </span>
              )}
              <span className="entry-amount">{formatMoney(Number(e.amount), currency, locale)}</span>
              <button className="linklike danger" onClick={() => deleteEntry(e.id)} aria-label={`${t('common.delete')} ${t(`budget.cat.${e.category}`)}`}>×</button>
            </li>
          ))}
        </ul>
        <EntryForm days={days} onAdd={addEntry} />
      </section>

      <p className="muted small legend">
        {CATEGORIES.map((c) => (
          <span key={c.key} className="legend-item">{c.emoji} {t(`cat.${c.key}`)}</span>
        ))}
      </p>
    </div>
  )
}

function EntryForm({
  days,
  onAdd,
}: {
  days: Day[]
  onAdd: (input: { category: string; amount: number; note: string | null; day_id: string | null }) => void
}) {
  const { t, locale } = useT()
  const [category, setCategory] = useState(ENTRY_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [dayId, setDayId] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!amt) return
    onAdd({ category, amount: amt, note: note.trim() || null, day_id: dayId || null })
    setAmount('')
    setNote('')
  }

  return (
    <form className="entry-form" onSubmit={submit}>
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        {ENTRY_CATEGORIES.map((c) => (
          <option key={c} value={c}>{t(`budget.cat.${c}`)}</option>
        ))}
      </select>
      <input
        type="number"
        min="0"
        inputMode="decimal"
        placeholder={t('budget.amount')}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="entry-amount-input"
      />
      <input placeholder={t('budget.noteOptional')} value={note} onChange={(e) => setNote(e.target.value)} />
      <select value={dayId} onChange={(e) => setDayId(e.target.value)}>
        <option value="">{t('budget.wholeTrip')}</option>
        {days.map((d) => (
          <option key={d.id} value={d.id}>{formatDayLabel(d.date, locale)}</option>
        ))}
      </select>
      <button type="submit" disabled={!Number(amount)}>{t('common.add')}</button>
    </form>
  )
}
