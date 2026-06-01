import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'password' | 'magic'

export function Login() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'working' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function signInPassword(e: FormEvent) {
    e.preventDefault()
    setStatus('working')
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      setError(error.message)
      setStatus('error')
    }
    // On success, the auth listener swaps this screen for the app.
  }

  async function sendMagicLink(e: FormEvent) {
    e.preventDefault()
    setStatus('working')
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  return (
    <div className="auth-card">
      <h1>Trip Planner</h1>

      {status === 'sent' ? (
        <p className="auth-note">
          Check <strong>{email}</strong> for a sign-in link. You can close this tab —
          opening the link will log you in.
        </p>
      ) : mode === 'password' ? (
        <form onSubmit={signInPassword} className="auth-form">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={status === 'working'}>
            {status === 'working' ? 'Signing in…' : 'Sign in'}
          </button>
          {error && <p className="auth-error">{error}</p>}
          <button
            type="button"
            className="auth-switch linklike"
            onClick={() => {
              setMode('magic')
              setError(null)
            }}
          >
            Email me a magic link instead
          </button>
        </form>
      ) : (
        <form onSubmit={sendMagicLink} className="auth-form">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" disabled={status === 'working'}>
            {status === 'working' ? 'Sending…' : 'Send magic link'}
          </button>
          {error && <p className="auth-error">{error}</p>}
          <button
            type="button"
            className="auth-switch linklike"
            onClick={() => {
              setMode('password')
              setError(null)
            }}
          >
            Use a password instead
          </button>
        </form>
      )}
    </div>
  )
}
