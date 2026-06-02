import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n/I18nProvider'

type Mode = 'password' | 'magic'

export function Login() {
  const { t } = useT()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'working' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function forgotPassword() {
    if (!email.trim()) {
      setError(t('auth.enterEmailFirst'))
      return
    }
    setError(null)
    setNotice(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    if (error) setError(error.message)
    else setNotice(t('auth.resetSent'))
  }

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
      <h1>{t('appName')}</h1>

      {status === 'sent' ? (
        <p className="auth-note">{t('auth.magicLinkSent', { email })}</p>
      ) : mode === 'password' ? (
        <form onSubmit={signInPassword} className="auth-form">
          <label htmlFor="email">{t('auth.email')}</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="password">{t('auth.password')}</label>
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
            {status === 'working' ? t('auth.signingIn') : t('auth.signIn')}
          </button>
          {error && <p className="auth-error">{error}</p>}
          {notice && <p className="invite-ok">{notice}</p>}
          <div className="auth-links">
            <button type="button" className="linklike" onClick={forgotPassword}>
              {t('auth.forgotPassword')}
            </button>
            <button
              type="button"
              className="linklike"
              onClick={() => {
                setMode('magic')
                setError(null)
                setNotice(null)
              }}
            >
              {t('auth.useMagicLink')}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={sendMagicLink} className="auth-form">
          <label htmlFor="email">{t('auth.email')}</label>
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
            {status === 'working' ? t('auth.sending') : t('auth.sendMagicLink')}
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
            {t('auth.usePassword')}
          </button>
        </form>
      )}
    </div>
  )
}
