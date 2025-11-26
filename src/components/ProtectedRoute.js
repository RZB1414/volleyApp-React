import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth.js'

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="card-surface text-center text-slate-300">
        Validating session...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children ?? <Outlet />
}

export default ProtectedRoute
