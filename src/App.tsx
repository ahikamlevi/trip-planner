import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { PasswordRecoveryScreen } from './auth/SetPassword'
import { useT } from './i18n/I18nProvider'
import { Landing } from './routes/Landing'

// Heavy authenticated routes are split into their own chunks so a logged-out visitor on
// the public landing page never downloads them. TripView in particular pulls in Leaflet
// (maps) and dnd-kit (itinerary) — keeping those out of the initial bundle is the bulk of
// the bandwidth/load-time win. They load on demand behind <Suspense>.
const Dashboard = lazy(() => import('./routes/Dashboard').then((m) => ({ default: m.Dashboard })))
const TripView = lazy(() => import('./routes/TripView').then((m) => ({ default: m.TripView })))
const Legal = lazy(() => import('./routes/Legal').then((m) => ({ default: m.Legal })))

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
      <Suspense fallback={<div className="centered">{t('common.loading')}</div>}>
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
      </Suspense>
    </>
  )
}
