import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { AppHeader } from '../components/AppHeader'
import { EmojiPicker, DEFAULT_COVER } from '../components/EmojiPicker'
import { useT } from '../i18n/I18nProvider'
import { supabase } from '../lib/supabase'
import type { Trip, TripRole } from '../lib/database.types'

interface MembershipRow {
  role: TripRole
  trip: Trip
}

export function Dashboard() {
  const { t } = useT()
  const { session } = useAuth()
  const uid = session!.user.id
  const [rows, setRows] = useState<MembershipRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('trip_members')
      .select('role, trip:trips(*)')
      .eq('user_id', uid)
      .returns<MembershipRow[]>()

    if (error) setError(error.message)
    else {
      const sorted = (data ?? [])
        .filter((r) => r.trip)
        .sort((a, b) => (a.trip.start_date ?? '').localeCompare(b.trip.start_date ?? ''))
      setRows(sorted)
    }
  }, [uid])

  useEffect(() => {
    void load()
  }, [load])

  const owned = rows?.filter((r) => r.trip.owner_id === uid) ?? []
  const shared = rows?.filter((r) => r.trip.owner_id !== uid) ?? []

  return (
    <div className="page">
      <AppHeader />

      <main className="page-body" id="main" tabIndex={-1}>
        <div className="section-head">
          <h2>{t('dash.yourTrips')}</h2>
          <button onClick={() => setCreating((c) => !c)}>{creating ? t('common.cancel') : t('dash.newTrip')}</button>
        </div>

        {creating && <NewTripForm ownerId={uid} onCreated={() => { setCreating(false); void load() }} />}

        {error && <p className="auth-error">{error}</p>}
        {rows === null && !error && <TripListSkeleton />}

        {rows !== null && owned.length === 0 && shared.length === 0 && (
          <div className="empty-state">
            <span className="empty-emoji" aria-hidden="true">🧳</span>
            <p className="empty-title">{t('dash.noTrips')}</p>
            <p className="muted">{t('dash.createFirst')}</p>
            {!creating && <button onClick={() => setCreating(true)}>{t('dash.newTrip')}</button>}
          </div>
        )}

        {owned.length > 0 && <TripGroup trips={owned} />}

        {shared.length > 0 && (
          <>
            <h3 className="group-label">{t('dash.sharedWithYou')}</h3>
            <TripGroup trips={shared} />
          </>
        )}
      </main>
    </div>
  )
}

function TripListSkeleton() {
  return (
    <ul className="trip-list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <div className="trip-link skeleton-row">
            <span className="skeleton skeleton-text" style={{ width: '40%' }} />
            <span className="skeleton skeleton-text" style={{ width: '20%', marginInlineStart: 'auto' }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function TripGroup({ trips }: { trips: MembershipRow[] }) {
  const { t } = useT()
  return (
    <ul className="trip-list">
      {trips.map(({ trip, role }) => (
        <li key={trip.id}>
          <Link to={`/trips/${trip.id}`} className="trip-link">
            <span className="trip-cover" aria-hidden="true">{trip.cover_emoji || DEFAULT_COVER}</span>
            <span className="trip-link-body">
              <span className="trip-name">{trip.name}</span>
              {trip.country && <span className="muted"> · {trip.country}</span>}
              <span className="trip-dates muted">{formatRange(trip.start_date, trip.end_date)}</span>
            </span>
            <span className={`role-badge role-${role}`}>{t(`role.${role}`)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function NewTripForm({ ownerId, onCreated }: { ownerId: string; onCreated: () => void }) {
  const { t } = useT()
  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [emoji, setEmoji] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('trips').insert({
      name: name.trim(),
      country: country.trim() || null,
      start_date: start || null,
      end_date: end || null,
      cover_emoji: emoji,
      owner_id: ownerId,
    })
    setSaving(false)
    if (error) setError(error.message)
    else onCreated()
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <label>
        {t('trip.name')}
        <input value={name} required onChange={(e) => setName(e.target.value)} placeholder={t('trip.namePlaceholder')} />
      </label>
      <EmojiPicker value={emoji} onChange={setEmoji} label={t('trip.coverEmoji')} />
      <label>
        {t('trip.country')} <span className="muted">{t('trip.optional')}</span>
        <input value={country} onChange={(e) => setCountry(e.target.value)} />
      </label>
      <div className="form-row">
        <label>
          {t('trip.start')} <span className="muted">{t('trip.optional')}</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          {t('trip.end')} <span className="muted">{t('trip.optional')}</span>
          <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {error && <p className="auth-error">{error}</p>}
      <button type="submit" disabled={saving || !name.trim()}>
        {saving ? t('trip.creating') : t('trip.create')}
      </button>
    </form>
  )
}

function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) return ''
  if (start && end) return ` · ${start} → ${end}`
  return ` · ${start ?? end}`
}
