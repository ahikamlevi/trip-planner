import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { PasswordRecoveryScreen } from './auth/SetPassword'
import { useT } from './i18n/I18nProvider'
import { Landing } from './routes/Landing'
import { Dashboard } from './routes/Dashboard'
import { TripView } from './routes/TripView'

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

  if (!session) {
    return <Landing />
  }

  return (
    <>
      <a className="skip-link" href="#main">
        {t('a11y.skip')}
      </a>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trips/:tripId" element={<TripView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
