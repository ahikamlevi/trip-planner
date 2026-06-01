import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { AppHeader } from '../components/AppHeader'
import { PlacesWorkspace } from '../places/PlacesWorkspace'
import { ItineraryBoard } from '../itinerary/ItineraryBoard'
import { BudgetPanel } from '../budget/BudgetPanel'
import { PackingPanel } from '../packing/PackingPanel'
import { CURRENCIES } from '../budget/money'
import { today } from '../itinerary/dates'
import { supabase } from '../lib/supabase'
import { useTripRealtime } from '../lib/useTripRealtime'
import type { InviteResult, Trip, TripRole } from '../lib/database.types'

type Tab = 'places' | 'itinerary' | 'budget' | 'packing'

interface MemberRow {
  user_id: string
  role: TripRole
  profile: { display_name: string | null } | null
}

export function TripView() {
  const { tripId } = useParams<{ tripId: string }>()
  const { session } = useAuth()
  const uid = session!.user.id
  const navigate = useNavigate()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('places')
  const autoTab = useRef(false)

  const isOwner = trip?.owner_id === uid

  const load = useCallback(async () => {
    if (!tripId) return
    const [tripRes, memberRes] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
      supabase
        .from('trip_members')
        .select('user_id, role, profile:profiles(display_name)')
        .eq('trip_id', tripId)
        .returns<MemberRow[]>(),
    ])
    if (tripRes.error) setError(tripRes.error.message)
    else setTrip(tripRes.data)
    if (!memberRes.error) setMembers(memberRes.data ?? [])
    setLoading(false)
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  useTripRealtime(tripId, load)

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

  if (loading) return <div className="page"><AppHeader /><div className="page-body"><p className="muted">Loading…</p></div></div>

  if (!trip) {
    return (
      <div className="page">
        <AppHeader />
        <div className="page-body">
          <p className="auth-error">{error ?? 'Trip not found, or you no longer have access.'}</p>
          <Link to="/" className="back-link">← Back to trips</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <AppHeader />
      <div className="page-body wide">
        <Link to="/" className="back-link">← All trips</Link>

        <TripHeader trip={trip} isOwner={isOwner} onChange={load} onDeleted={() => navigate('/')} />

        <div className="tabs">
          <button className={`tab${tab === 'places' ? ' active' : ''}`} onClick={() => setTab('places')}>
            Map &amp; places
          </button>
          <button className={`tab${tab === 'itinerary' ? ' active' : ''}`} onClick={() => setTab('itinerary')}>
            Itinerary
          </button>
          <button className={`tab${tab === 'budget' ? ' active' : ''}`} onClick={() => setTab('budget')}>
            Budget
          </button>
          <button className={`tab${tab === 'packing' ? ' active' : ''}`} onClick={() => setTab('packing')}>
            Packing
          </button>
        </div>

        {tab === 'places' && <PlacesWorkspace tripId={trip.id} />}
        {tab === 'itinerary' && (
          <ItineraryBoard tripId={trip.id} startDate={trip.start_date} endDate={trip.end_date} />
        )}
        {tab === 'budget' && <BudgetPanel tripId={trip.id} currency={trip.currency} />}
        {tab === 'packing' && <PackingPanel tripId={trip.id} />}

        <TripNotes trip={trip} isOwner={isOwner} onChange={load} />

        <details className="card members-details">
          <summary>Members &amp; sharing</summary>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.user_id}>
                <span>
                  {m.profile?.display_name || (m.user_id === uid ? 'You' : 'Unnamed traveler')}
                  {m.user_id === uid && m.profile?.display_name && <span className="muted"> (you)</span>}
                </span>
                <span className="member-actions">
                  <span className={`role-badge role-${m.role}`}>{m.role}</span>
                  {isOwner && m.user_id !== uid && (
                    <button
                      className="linklike danger"
                      onClick={async () => {
                        await supabase.from('trip_members').delete().eq('trip_id', trip.id).eq('user_id', m.user_id)
                        void load()
                      }}
                    >
                      remove
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {isOwner && <InviteForm tripId={trip.id} onInvited={load} />}
        </details>
      </div>
    </div>
  )
}

function TripNotes({ trip, isOwner, onChange }: { trip: Trip; isOwner: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(trip.notes ?? '')
  const [saving, setSaving] = useState(false)

  // Stay in sync if notes change via realtime while not actively editing.
  useEffect(() => {
    if (!editing) setText(trip.notes ?? '')
  }, [trip.notes, editing])

  async function save() {
    setSaving(true)
    await supabase.from('trips').update({ notes: text.trim() || null }).eq('id', trip.id)
    setSaving(false)
    setEditing(false)
    onChange()
  }

  // Non-owner with no notes: nothing to show.
  if (!trip.notes && !isOwner) return null

  return (
    <details className="card members-details" open={!!trip.notes}>
      <summary>Trip notes</summary>
      {editing ? (
        <div className="form-grid">
          <textarea
            className="day-note-input"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Overall plan, links, confirmation numbers…"
          />
          <div className="button-row">
            <button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="secondary" onClick={() => { setEditing(false); setText(trip.notes ?? '') }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {trip.notes ? (
            <p className="trip-notes-text">{trip.notes}</p>
          ) : (
            <p className="muted small">No notes yet.</p>
          )}
          {isOwner && (
            <button className="secondary" onClick={() => setEditing(true)}>
              {trip.notes ? 'Edit notes' : 'Add notes'}
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
  const [saving, setSaving] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase
      .from('trips')
      .update({
        name: name.trim(),
        country: country.trim() || null,
        start_date: start || null,
        end_date: end || null,
        currency,
      })
      .eq('id', trip.id)
    setSaving(false)
    setEditing(false)
    onChange()
  }

  async function remove() {
    if (!confirm(`Delete “${trip.name}”? This removes the trip for everyone.`)) return
    await supabase.from('trips').delete().eq('id', trip.id)
    onDeleted()
  }

  if (editing) {
    return (
      <form className="card form-grid" onSubmit={save}>
        <label>
          Trip name
          <input value={name} required onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Country
          <input value={country} onChange={(e) => setCountry(e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            Start
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            End
            <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label>
            Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="button-row">
          <button type="submit" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </form>
    )
  }

  return (
    <div className="trip-head">
      <div>
        <h1>{trip.name}</h1>
        <p className="muted">
          {trip.country ?? 'No country set'}
          {(trip.start_date || trip.end_date) && ` · ${trip.start_date ?? '?'} → ${trip.end_date ?? '?'}`}
        </p>
      </div>
      {isOwner && (
        <div className="button-row">
          <button className="secondary" onClick={() => setEditing(true)}>Edit</button>
          <button className="secondary danger" onClick={remove}>Delete</button>
        </div>
      )}
    </div>
  )
}

const INVITE_MESSAGES: Record<InviteResult, string> = {
  added: 'Added! They can see this trip now.',
  already_member: 'That person is already a member.',
  no_account: 'No account exists for that email yet. Add them in Supabase → Authentication → Users first.',
  not_owner: 'Only the trip owner can invite people.',
}

function InviteForm({ tripId, onInvited }: { tripId: string; onInvited: () => void }) {
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
    setMsg({ kind: result === 'added' ? 'ok' : 'err', text: INVITE_MESSAGES[result] })
    if (result === 'added') {
      setEmail('')
      onInvited()
    }
  }

  return (
    <form className="invite-form" onSubmit={submit}>
      <label>Invite by email</label>
      <div className="form-row">
        <input
          type="email"
          required
          placeholder="person@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={busy || !email.trim()}>{busy ? 'Inviting…' : 'Invite'}</button>
      </div>
      {msg && <p className={msg.kind === 'ok' ? 'invite-ok' : 'auth-error'}>{msg.text}</p>}
    </form>
  )
}
