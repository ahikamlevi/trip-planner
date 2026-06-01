import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

/** The inner form: sets the signed-in user's password via updateUser. */
export function SetPasswordForm({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'working' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 6) return setError('Use at least 6 characters.')
    if (pw !== confirm) return setError('Passwords don’t match.')
    setStatus('working')
    setError(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) {
      setError(error.message)
      setStatus('idle')
    } else {
      setStatus('done')
      setTimeout(onDone, 900)
    }
  }

  if (status === 'done') {
    return <p className="invite-ok">Password set! You can now sign in with email + password.</p>
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <label htmlFor="new-pw">New password</label>
      <input
        id="new-pw"
        type="password"
        required
        autoComplete="new-password"
        placeholder="••••••••"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
      />
      <label htmlFor="confirm-pw">Confirm password</label>
      <input
        id="confirm-pw"
        type="password"
        required
        autoComplete="new-password"
        placeholder="••••••••"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <button type="submit" disabled={status === 'working'}>
        {status === 'working' ? 'Saving…' : 'Set password'}
      </button>
      {error && <p className="auth-error">{error}</p>}
    </form>
  )
}

/** Full-screen version shown after opening a password-recovery link. */
export function PasswordRecoveryScreen({ onDone }: { onDone: () => void }) {
  return (
    <div className="auth-card">
      <h1>Set a password</h1>
      <p className="auth-note">Choose a password to finish — you’ll use it to sign in from now on.</p>
      <SetPasswordForm onDone={onDone} />
    </div>
  )
}
