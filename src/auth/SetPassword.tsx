import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n/I18nProvider'

/** The inner form: sets the signed-in user's password via updateUser. */
export function SetPasswordForm({ onDone }: { onDone: () => void }) {
  const { t } = useT()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'working' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 8) return setError(t('auth.passwordTooShort'))
    if (pw !== confirm) return setError(t('auth.passwordsDontMatch'))
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
    return <p className="invite-ok">{t('auth.passwordSet')}</p>
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <label htmlFor="new-pw">{t('auth.newPassword')}</label>
      <input
        id="new-pw"
        type="password"
        required
        autoComplete="new-password"
        placeholder="••••••••"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
      />
      <label htmlFor="confirm-pw">{t('auth.confirmPassword')}</label>
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
        {status === 'working' ? t('auth.saving') : t('auth.setPassword')}
      </button>
      {error && <p className="auth-error">{error}</p>}
    </form>
  )
}

/** Full-screen version shown after opening a password-recovery link. */
export function PasswordRecoveryScreen({ onDone }: { onDone: () => void }) {
  const { t } = useT()
  return (
    <div className="auth-card">
      <h1>{t('auth.setPasswordTitle')}</h1>
      <p className="auth-note">{t('auth.setPasswordIntro')}</p>
      <SetPasswordForm onDone={onDone} />
    </div>
  )
}
