import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { SetPasswordForm } from '../auth/SetPassword'
import { useT } from '../i18n/I18nProvider'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'
import { useTheme } from '../theme/ThemeProvider'
import { supabase } from '../lib/supabase'

export function AppHeader() {
  const { t } = useT()
  const { theme, toggle } = useTheme()
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
        {t('appName')}
      </Link>
      <div className="app-header-user">
        <button
          className="theme-toggle"
          onClick={toggle}
          title={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
          aria-label={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <LanguageSwitcher />
        {editing ? (
          <span className="name-edit">
            <input
              value={name}
              placeholder={t('common.yourName')}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <button onClick={save} disabled={saving}>
              {saving ? '…' : t('common.save')}
            </button>
          </span>
        ) : (
          <button className="linklike" onClick={() => setEditing(true)} title={t('common.yourName')}>
            {name || session!.user.email}
          </button>
        )}
        <button onClick={() => setShowPassword(true)} title={t('auth.setYourPassword')}>
          {t('auth.password')}
        </button>
        <button onClick={signOut}>{t('common.signOut')}</button>
      </div>

      {showPassword && (
        <div className="modal-overlay" onClick={() => setShowPassword(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>{t('auth.setYourPassword')}</strong>
              <button className="linklike" onClick={() => setShowPassword(false)}>{t('common.close')}</button>
            </div>
            <p className="muted small">{t('auth.passwordHelp')}</p>
            <SetPasswordForm onDone={() => setShowPassword(false)} />
          </div>
        </div>
      )}
    </header>
  )
}
