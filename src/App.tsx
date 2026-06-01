import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { Login } from './auth/Login'
import { Dashboard } from './routes/Dashboard'
import { TripView } from './routes/TripView'

export function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="centered">Loading…</div>
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
