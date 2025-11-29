import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth.js'

const authedLinks = [
  { to: '/', label: 'Dashboard' },
  { to: '/videos', label: 'Videos' },
  { to: '/profile', label: 'Profile' },
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
  const { isAuthenticated, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="flex flex-col">
          <span className="text-lg font-bold tracking-tight text-white">Volley Plus Console</span>
        </Link>
        <nav className="flex flex-1 items-center justify-end gap-2">
          {(isAuthenticated ? authedLinks : guestLinks).map((link) => (
            <NavLink key={link.to} to={link.to} className={buildClass} end={link.to === '/'}>
              {link.label}
            </NavLink>
          ))}
          {isAuthenticated && (
            <button
              type="button"
              onClick={handleLogout}
              className="btn-secondary text-sm inline-flex items-center justify-center"
              aria-label="Logout"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-current"
              >
                <path
                  d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 17l5-5-5-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M15 12H3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="sr-only">Logout</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}

export default NavigationBar
