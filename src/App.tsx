import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { Login } from './auth/Login'
import { PasswordRecoveryScreen } from './auth/SetPassword'
import { Dashboard } from './routes/Dashboard'
import { TripView } from './routes/TripView'

export function App() {
  const { session, loading, passwordRecovery, endPasswordRecovery } = useAuth()

  if (loading) {
    return <div className="centered">Loading…</div>
  }

  // A recovery link signs the user in, then we let them choose a password.
  if (passwordRecovery && session) {
    return <PasswordRecoveryScreen onDone={endPasswordRecovery} />
  }

  if (!session) {
    return <Login />
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/trips/:tripId" element={<TripView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
