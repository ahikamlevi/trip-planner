import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { SetPasswordForm } from '../auth/SetPassword'
import { supabase } from '../lib/supabase'

export function AppHeader() {
  const { session, signOut } = useAuth()
  const uid = session!.user.id
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => setName(data?.display_name ?? ''))
  }, [uid])

  async function save() {
    setSaving(true)
    await supabase.from('profiles').update({ display_name: name.trim() || null }).eq('id', uid)
    setSaving(false)
    setEditing(false)
  }

  return (
    <header className="app-header">
      <Link to="/" className="app-title">
        Trip Planner
      </Link>
      <div className="app-header-user">
        {editing ? (
          <span className="name-edit">
            <input
              value={name}
              placeholder="Your name"
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <button onClick={save} disabled={saving}>
              {saving ? '…' : 'Save'}
            </button>
          </span>
        ) : (
          <button className="linklike" onClick={() => setEditing(true)} title="Edit your display name">
            {name || session!.user.email}
          </button>
        )}
        <button onClick={() => setShowPassword(true)} title="Set or change your password">
          Password
        </button>
        <button onClick={signOut}>Sign out</button>
      </div>

      {showPassword && (
        <div className="modal-overlay" onClick={() => setShowPassword(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>Set your password</strong>
              <button className="linklike" onClick={() => setShowPassword(false)}>close</button>
            </div>
            <p className="muted small">Lets you sign in with email + password.</p>
            <SetPasswordForm onDone={() => setShowPassword(false)} />
          </div>
        </div>
      )}
    </header>
  )
}
