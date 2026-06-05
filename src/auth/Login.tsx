import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n/I18nProvider'

type Mode = 'password' | 'magic' | 'signup'

export function Login() {
  const { t } = useT()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // 'sent' = magic link emailed; 'verify' = sign-up confirmation email sent.
  const [status, setStatus] = useState<'idle' | 'working' | 'sent' | 'verify' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
    setStatus('idle')
  }

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

  async function signUp(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'))
      return
    }
    setStatus('working')
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setStatus('error')
      return
    }
    // With email confirmation on, there's no session yet → ask them to verify.
    // With it off, a session exists and the auth listener swaps to the app.
    if (!data.session) setStatus('verify')
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
      ) : status === 'verify' ? (
        <p className="auth-note">{t('auth.verifyEmail', { email })}</p>
      ) : mode === 'magic' ? (
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
          <button type="button" className="auth-switch linklike" onClick={() => switchMode('password')}>
            {t('auth.usePassword')}
          </button>
        </form>
      ) : (
        // 'password' and 'signup' share the email+password form.
        <form onSubmit={mode === 'signup' ? signUp : signInPassword} className="auth-form">
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
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={status === 'working'}>
            {status === 'working'
              ? mode === 'signup'
                ? t('auth.creating')
                : t('auth.signingIn')
              : mode === 'signup'
                ? t('auth.signUp')
                : t('auth.signIn')}
          </button>
          {error && <p className="auth-error">{error}</p>}
          {notice && <p className="invite-ok">{notice}</p>}
          <div className="auth-links">
            {mode === 'password' && (
              <button type="button" className="linklike" onClick={forgotPassword}>
                {t('auth.forgotPassword')}
              </button>
            )}
            {mode === 'password' && (
              <button type="button" className="linklike" onClick={() => switchMode('magic')}>
                {t('auth.useMagicLink')}
              </button>
            )}
            <button
              type="button"
              className="linklike"
              onClick={() => switchMode(mode === 'signup' ? 'password' : 'signup')}
            >
              {mode === 'signup' ? t('auth.haveAccount') : t('auth.noAccount')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
