import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth.js'

const authedLinks = [
  { to: '/', label: 'Dashboard' },
  { to: '/upload', label: 'Upload Manager' },
  { to: '/pending', label: 'Pending Uploads' },
  { to: '/download', label: 'Download Videos' },
]

const guestLinks = [
  { to: '/login', label: 'Login' },
  { to: '/register', label: 'Register' },
]

const buildClass = ({ isActive }) =>
  `rounded-full px-4 py-2 text-sm font-semibold transition ${
    isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white'
  }`

const NavigationBar = () => {
  const navigate = useNavigate()
  const { isAuthenticated, logout, user } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="flex flex-col">
          <span className="text-lg font-bold tracking-tight text-white">Volley Plus Console</span>
          <span className="text-xs uppercase tracking-widest text-slate-400">API Control Center</span>
        </Link>
        <nav className="flex flex-1 items-center justify-end gap-2">
          {(isAuthenticated ? authedLinks : guestLinks).map((link) => (
            <NavLink key={link.to} to={link.to} className={buildClass} end={link.to === '/'}>
              {link.label}
            </NavLink>
          ))}
          {isAuthenticated && (
            <button type="button" onClick={handleLogout} className="btn-secondary text-sm">
              Logout {user?.name ? `(${user.name})` : ''}
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}

export default NavigationBar
