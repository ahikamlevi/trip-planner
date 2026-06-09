import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { AppHeader } from '../components/AppHeader'
import { Menu } from '../components/Menu'
import { EmojiPicker, DEFAULT_COVER } from '../components/EmojiPicker'
import { RouteOverview } from '../route/RouteOverview'
import { PlacesWorkspace } from '../places/PlacesWorkspace'
import { ItineraryBoard } from '../itinerary/ItineraryBoard'
import { BudgetPanel } from '../budget/BudgetPanel'
import { PackingPanel } from '../packing/PackingPanel'
import { DietaryPanel } from '../dietary/DietaryPanel'
import { CURRENCIES } from '../budget/money'
import { daysBetween, today } from '../itinerary/dates'
import { useT } from '../i18n/I18nProvider'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import { useTripRealtime } from '../lib/useTripRealtime'
import { TripProgress } from '../components/TripProgress'
import { TripReadyCelebration } from '../components/TripReadyCelebration'
import { BottomNav, TABS, type Tab } from '../components/BottomNav'
import { computeTripProgress, type TripProgress as Progress } from '../progress/tripProgress'
import type { InviteResult, Trip, TripRole } from '../lib/database.types'

interface TripStats {
  days: number
  cities: number
  stops: number
}

interface MemberRow {
  user_id: string
  role: TripRole
  profile: { display_name: string | null; email: string | null } | null
}

export function TripView() {
  const { t } = useT()
  const toast = useToast()
  const { tripId } = useParams<{ tripId: string }>()
  const { session } = useAuth()
  const uid = session!.user.id
  const navigate = useNavigate()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [stats, setStats] = useState<TripStats>({ days: 0, cities: 0, stops: 0 })
  const [showCelebration, setShowCelebration] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('route')
  // When you tap "Plan days" on a Route destination, focus the Itinerary on that city.
  const [planFocus, setPlanFocus] = useState<{ date: string | null; label: string } | null>(null)
  const autoTab = useRef(false)

  const isOwner = trip?.owner_id === uid

  const load = useCallback(async () => {
    if (!tripId) return
    const [tripRes, memberRes, areaRes, placeRes, budgetRes, packingRes] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
      supabase
        .from('trip_members')
        .select('user_id, role, profile:profiles(display_name, email)')
        .eq('trip_id', tripId)
        .returns<MemberRow[]>(),
      supabase.from('areas').select('start_date, end_date, transport_mode').eq('trip_id', tripId),
      supabase.from('places').select('scheduled, est_cost').eq('trip_id', tripId),
      supabase.from('budget_entries').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
      supabase.from('packing_items').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
    ])
    if (tripRes.error) setError(tripRes.error.message)
    else setTrip(tripRes.data)
    if (!memberRes.error) setMembers(memberRes.data ?? [])

    // Completion meter — derive from already-fetched counts (no extra round-trips).
    if (tripRes.data) {
      const td = tripRes.data
      const areas = areaRes.data ?? []
      const places = placeRes.data ?? []
      const stopCount = places.filter((p) => p.scheduled).length
      setProgress(
        computeTripProgress({
          started: true,
          destinationCount: areas.length,
          hasTripDates: !!(td.start_date && td.end_date),
          datedDestinations: areas.filter((a) => a.start_date && a.end_date).length,
          scheduledPlaces: stopCount,
          transportSet: areas.filter((a) => a.transport_mode).length,
          budgetEntries: budgetRes.count ?? 0,
          pricedPlaces: places.filter((p) => p.est_cost != null).length,
          packingItems: packingRes.count ?? 0,
        }),
      )
      setStats({
        days: td.start_date && td.end_date ? daysBetween(td.start_date, td.end_date) + 1 : 0,
        cities: areas.length,
        stops: stopCount,
      })
    }
    setLoading(false)
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  useTripRealtime(tripId, load)

  // Fire the "trip ready" celebration once when a plan first crosses the ready
  // threshold. A per-trip localStorage flag keeps it from re-firing on reload;
  // dropping back below the threshold clears the flag so a genuine re-completion
  // can celebrate again.
  useEffect(() => {
    if (!tripId || !progress) return
    const key = `tp:celebrated:${tripId}`
    let done = false
    try {
      done = localStorage.getItem(key) === '1'
    } catch {
      /* ignore */
    }
    if (progress.ready && !done) {
      setShowCelebration(true)
      try {
        localStorage.setItem(key, '1')
      } catch {
        /* ignore */
      }
    } else if (!progress.ready && done) {
      try {
        localStorage.removeItem(key)
      } catch {
        /* ignore */
      }
    }
  }, [tripId, progress])

  // Auto-open to the itinerary when today falls within the trip (the "Today" feel).
  useEffect(() => {
    if (trip && !autoTab.current) {
      autoTab.current = true
      const t = today()
      if (trip.start_date && trip.end_date && t >= trip.start_date && t <= trip.end_date) {
        setTab('itinerary')
      }
    }
  }, [trip])

  if (loading) return <div className="page"><AppHeader /><div className="page-body"><p className="muted">{t('common.loading')}</p></div></div>

  if (!trip) {
    return (
      <div className="page">
        <AppHeader />
        <div className="page-body">
          <p className="auth-error">{error ?? t('tripview.notFound')}</p>
          <Link to="/" className="back-link">→ {t('tripview.backToTrips')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <AppHeader />
      <main className="page-body wide" id="main" tabIndex={-1}>
        <Link to="/" className="back-link">→ {t('tripview.allTrips')}</Link>

        <TripHeader trip={trip} isOwner={isOwner} onChange={load} onDeleted={() => navigate('/')} />

        {progress && <TripProgress progress={progress} onGoToTab={setTab} />}

        <nav className="tabs" aria-label={t('tab.sections')}>
          {TABS.map((s) => (
            <button
              key={s.key}
              className={`tab${tab === s.key ? ' active' : ''}`}
              aria-current={tab === s.key ? 'page' : undefined}
              onClick={() => setTab(s.key)}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </nav>

        {tab === 'route' && (
          <RouteOverview
            tripId={trip.id}
            onPlanDestination={(dest) => {
              setPlanFocus({ date: dest.start_date, label: dest.name })
              setTab('itinerary')
            }}
          />
        )}
        {tab === 'places' && <PlacesWorkspace tripId={trip.id} />}
        {tab === 'itinerary' && (
          <ItineraryBoard
            tripId={trip.id}
            tripName={trip.name}
            currency={trip.currency}
            notes={trip.notes}
            startDate={trip.start_date}
            endDate={trip.end_date}
            focusDate={planFocus?.date ?? null}
            focusLabel={planFocus?.label ?? null}
            onClearFocus={() => setPlanFocus(null)}
          />
        )}
        {tab === 'budget' && <BudgetPanel tripId={trip.id} currency={trip.currency} />}
        {tab === 'packing' && <PackingPanel tripId={trip.id} />}
        {tab === 'dietary' && <DietaryPanel tripId={trip.id} />}

        <TripNotes trip={trip} isOwner={isOwner} onChange={load} />

        <details className="card members-details">
          <summary>{t('tripview.membersSharing')}</summary>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.user_id}>
                <span className="member-id">
                  <span className="member-name">
                    {m.profile?.display_name || m.profile?.email || (m.user_id === uid ? t('tripview.you') : t('tripview.unnamed'))}
                    {m.user_id === uid && (m.profile?.display_name || m.profile?.email) && (
                      <span className="muted"> {t('tripview.youSuffix')}</span>
                    )}
                  </span>
                  {m.profile?.display_name && m.profile?.email && (
                    <span className="muted small member-email">{m.profile.email}</span>
                  )}
                </span>
                <span className="member-actions">
                  <span className={`role-badge role-${m.role}`}>{t(`role.${m.role}`)}</span>
                  {isOwner && m.user_id !== uid && (
                    <button
                      className="linklike danger"
                      onClick={async () => {
                        if (!confirm(t('tripview.confirmRemoveMember'))) return
                        const { error } = await supabase
                          .from('trip_members')
                          .delete()
                          .eq('trip_id', trip.id)
                          .eq('user_id', m.user_id)
                        if (error) toast.error(t('common.deleteFailed'))
                        else void load()
                      }}
                    >
                      {t('common.remove')}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {isOwner && <InviteForm tripId={trip.id} onInvited={load} />}
        </details>
      </main>

      <BottomNav tab={tab} onSelect={(next) => { setTab(next); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />

      {showCelebration && (
        <TripReadyCelebration
          tripName={trip.name}
          days={stats.days}
          cities={stats.cities}
          stops={stats.stops}
          onShare={() => {
            setShowCelebration(false)
            setTab('itinerary')
          }}
          onClose={() => setShowCelebration(false)}
        />
      )}
    </div>
  )
}

function TripNotes({ trip, isOwner, onChange }: { trip: Trip; isOwner: boolean; onChange: () => void }) {
  const { t } = useT()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(trip.notes ?? '')
  const [saving, setSaving] = useState(false)

  // Stay in sync if notes change via realtime while not actively editing.
  useEffect(() => {
    if (!editing) setText(trip.notes ?? '')
  }, [trip.notes, editing])

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('trips').update({ notes: text.trim() || null }).eq('id', trip.id)
    setSaving(false)
    if (error) {
      toast.error(t('common.saveFailed'))
      return
    }
    setEditing(false)
    onChange()
    toast.success(t('common.saved'))
  }

  // Non-owner with no notes: nothing to show.
  if (!trip.notes && !isOwner) return null

  return (
    <details className="card members-details" open={!!trip.notes}>
      <summary>{t('notes.title')}</summary>
      {editing ? (
        <div className="form-grid">
          <textarea
            className="day-note-input"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('notes.placeholder')}
          />
          <div className="button-row">
            <button onClick={save} disabled={saving}>{saving ? t('auth.saving') : t('common.save')}</button>
            <button className="secondary" onClick={() => { setEditing(false); setText(trip.notes ?? '') }}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {trip.notes ? (
            <p className="trip-notes-text">{trip.notes}</p>
          ) : (
            <p className="muted small">{t('notes.none')}</p>
          )}
          {isOwner && (
            <button className="secondary" onClick={() => setEditing(true)}>
              {trip.notes ? t('notes.editNotes') : t('notes.addNotes')}
            </button>
          )}
        </>
      )}
    </details>
  )
}

function TripHeader({
  trip,
  isOwner,
  onChange,
  onDeleted,
}: {
  trip: Trip
  isOwner: boolean
  onChange: () => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(trip.name)
  const [country, setCountry] = useState(trip.country ?? '')
  const [start, setStart] = useState(trip.start_date ?? '')
  const [end, setEnd] = useState(trip.end_date ?? '')
  const [currency, setCurrency] = useState(trip.currency)
  const [emoji, setEmoji] = useState<string | null>(trip.cover_emoji)
  const [saving, setSaving] = useState(false)
  const { t } = useT()
  const toast = useToast()

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)

    // If the start date changed and the trip already has days, offer to shift the whole
    // plan by the delta so existing routes/stops/notes move with the anchor — the
    // common case is "I cloned a template / I set the trip on the wrong dates."
    // When there was no previous start_date, anchor to the earliest existing day so
    // the user's plan becomes Day 1 = new start, etc.
    let shiftDelta = 0
    if (start && start !== (trip.start_date ?? '')) {
      const { data: dayRows } = await supabase
        .from('days')
        .select('date')
        .eq('trip_id', trip.id)
        .order('date')
      if (dayRows && dayRows.length > 0) {
        const anchor = trip.start_date ?? dayRows[0].date
        const delta = daysBetween(anchor, start)
        if (delta !== 0) {
          const deltaLabel = delta > 0 ? `+${delta}` : String(delta)
          if (confirm(t('trip.shiftDaysConfirm', { count: dayRows.length, delta: deltaLabel }))) {
            shiftDelta = delta
          }
        }
      }
    }

    const { error } = await supabase
      .from('trips')
      .update({
        name: name.trim(),
        country: country.trim() || null,
        start_date: start || null,
        end_date: end || null,
        currency,
        cover_emoji: emoji,
      })
      .eq('id', trip.id)
    if (error) {
      setSaving(false)
      toast.error(t('common.saveFailed'))
      return
    }

    if (shiftDelta !== 0) {
      const { error: shiftErr } = await supabase.rpc('shift_trip_days', {
        _trip_id: trip.id,
        _delta_days: shiftDelta,
      })
      if (shiftErr) toast.error(t('trip.shiftDaysFailed'))
    }

    setSaving(false)
    setEditing(false)
    onChange()
    toast.success(t('common.saved'))
  }

  async function remove() {
    if (!confirm(t('tripview.confirmDelete', { name: trip.name }))) return
    const { error } = await supabase.from('trips').delete().eq('id', trip.id)
    if (error) {
      toast.error(t('common.deleteFailed'))
      return
    }
    onDeleted()
  }

  if (editing) {
    return (
      <form className="card form-grid" onSubmit={save}>
        <label>
          {t('trip.name')}
          <input value={name} required onChange={(e) => setName(e.target.value)} />
        </label>
        <EmojiPicker value={emoji} onChange={setEmoji} label={t('trip.coverEmoji')} />
        <label>
          {t('trip.country')}
          <input value={country} onChange={(e) => setCountry(e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            {t('trip.start')}
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            {t('trip.end')}
            <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label>
            {t('trip.currency')}
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="button-row">
          <button type="submit" disabled={saving || !name.trim()}>{saving ? t('auth.saving') : t('common.save')}</button>
          <button type="button" className="secondary" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
        </div>
      </form>
    )
  }

  return (
    <div className="trip-head">
      <div className="trip-head-title">
        <span className="trip-head-emoji" aria-hidden="true">{trip.cover_emoji || DEFAULT_COVER}</span>
        <div className="trip-head-meta">
          <h1>{trip.name}</h1>
          <p className="muted">
            {trip.country ?? t('tripview.noCountry')}
            {(trip.start_date || trip.end_date) && ` · ${trip.start_date ?? '?'} → ${trip.end_date ?? '?'}`}
          </p>
        </div>
      </div>
      {isOwner && (
        <Menu label={t('tripview.tripOptions')}>
          {(close) => (
            <>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() => { close(); setEditing(true) }}
              >
                ✏️ {t('tripview.edit')}
              </button>
              <button
                type="button"
                className="menu-item danger"
                role="menuitem"
                onClick={() => { close(); void remove() }}
              >
                🗑️ {t('common.delete')}
              </button>
            </>
          )}
        </Menu>
      )}
    </div>
  )
}

function InviteForm({ tripId, onInvited }: { tripId: string; onInvited: () => void }) {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('invite_member_by_email', {
      _trip_id: tripId,
      _email: email.trim(),
    })
    setBusy(false)
    if (error) {
      setMsg({ kind: 'err', text: error.message })
      return
    }
    const result = (data as InviteResult) ?? 'no_account'
    setMsg({ kind: result === 'added' ? 'ok' : 'err', text: t(`invite.${result}`) })
    if (result === 'added') {
      setEmail('')
      onInvited()
    }
  }

  return (
    <form className="invite-form" onSubmit={submit}>
      <label>{t('tripview.inviteByEmail')}</label>
      <div className="form-row">
        <input
          type="email"
          required
          placeholder="person@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={busy || !email.trim()}>{busy ? t('tripview.inviting') : t('tripview.invite')}</button>
      </div>
      {msg && <p className={msg.kind === 'ok' ? 'invite-ok' : 'auth-error'}>{msg.text}</p>}
    </form>
  )
}
