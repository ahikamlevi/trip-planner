import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { PasswordRecoveryScreen } from './auth/SetPassword'
import { useT } from './i18n/I18nProvider'
import { Landing } from './routes/Landing'
import { Dashboard } from './routes/Dashboard'
import { TripView } from './routes/TripView'
import { Legal } from './routes/Legal'

export function App() {
  const { t } = useT()
  const { session, loading, passwordRecovery, endPasswordRecovery } = useAuth()

  if (loading) {
    return <div className="centered">Loading…</div>
  }

  // A recovery link signs the user in, then we let them choose a password.
  if (passwordRecovery && session) {
    return <PasswordRecoveryScreen onDone={endPasswordRecovery} />
  }

  return (
    <>
      {session && (
        <a className="skip-link" href="#main">
          {t('a11y.skip')}
        </a>
      )}
      <Routes>
        {/* Public — reachable signed out (footer link) and signed in. */}
        <Route path="/legal" element={<Legal />} />
        {session ? (
          <>
            <Route path="/" element={<Dashboard />} />
            <Route path="/trips/:tripId" element={<TripView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <Route path="*" element={<Landing />} />
        )}
      </Routes>
    </>
  )
}
