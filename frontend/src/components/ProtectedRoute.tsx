import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function ProtectedRoute() {
  const { user, status, error, refresh } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <p className="notice" role="status">Checking your session...</p>
  }

  if (status === 'error') {
    return (
      <main className="auth-card">
        <p className="error" role="alert">{error}</p>
        <button className="button" onClick={() => void refresh()}>Try again</button>
      </main>
    )
  }

  return user ? <Outlet /> : <Navigate replace state={{ from: location }} to="/" />
}
