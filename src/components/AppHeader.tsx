import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { SetPasswordForm } from '../auth/SetPassword'
import { useT } from '../i18n/I18nProvider'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'
import { useTheme } from '../theme/ThemeProvider'
import { supabase } from '../lib/supabase'
import { Menu } from './Menu'
import { HelpGuide } from './HelpGuide'

export function AppHeader() {
  const { t } = useT()
  const { theme, toggle } = useTheme()
  const { session, signOut } = useAuth()
  const uid = session!.user.id
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
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
        <Menu label={t('common.account')}>
          {(close) => (
            <>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() => { close(); setShowHelp(true) }}
              >
                💡 {t('help.menuItem')}
              </button>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() => { close(); setShowPassword(true) }}
              >
                🔑 {t('auth.changePassword')}
              </button>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() => { close(); void signOut() }}
              >
                🚪 {t('common.signOut')}
              </button>
              <button
                type="button"
                className="menu-item danger"
                role="menuitem"
                onClick={() => { close(); setShowDelete(true) }}
              >
                🗑️ {t('account.delete')}
              </button>
            </>
          )}
        </Menu>
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

      {showHelp && <HelpGuide onClose={() => setShowHelp(false)} />}

      {showDelete && <DeleteAccountModal onClose={() => setShowDelete(false)} />}
    </header>
  )
}

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('delete_account')
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    // Account row is gone; clear the local session and return to the login screen.
    await signOut()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{t('account.deleteTitle')}</strong>
          <button className="linklike" onClick={onClose}>{t('common.close')}</button>
        </div>
        <p className="muted small">{t('account.deleteWarning')}</p>
        {error && <p className="auth-error">{error}</p>}
        <div className="button-row">
          <button className="danger" onClick={remove} disabled={busy}>
            {busy ? t('account.deleting') : t('account.deleteConfirm')}
          </button>
          <button className="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
