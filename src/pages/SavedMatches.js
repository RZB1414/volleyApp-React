import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/services/api.js'

const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })
const TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

const resolveDisplayDate = (match) => {
  if (!match) return '—'
  const source = match.matchDate || match.generatedAt
  if (!source) return '—'
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return '—'
  return DATE_FORMATTER.format(date)
}

const resolveDisplayTime = (match) => {
  if (!match) return '—'
  if (match.matchTime) return match.matchTime
  const source = match.matchDate || match.generatedAt
  if (!source) return '—'
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return '—'
  return TIME_FORMATTER.format(date)
}

const buildTeamsLabel = (teams = []) => {
  if (!Array.isArray(teams) || !teams.length) return 'Teams not informed'
  return teams.map((team) => team.team).filter(Boolean).join(' vs ')
}

const SavedMatches = () => {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchMatches = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.stats.listMatchReports({ limit: 20 })
      const items = Array.isArray(response?.items) ? response.items : []
      items.sort((a, b) => new Date(b.createdAt || b.generatedAt || 0) - new Date(a.createdAt || a.generatedAt || 0))
      setMatches(items)
    } catch (err) {
      setError(err?.message || 'Failed to load saved reports...')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMatches()
  }, [fetchMatches])

  useEffect(() => {
    const handler = () => {
      fetchMatches()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('matchreport:saved', handler)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('matchreport:saved', handler)
      }
    }
  }, [fetchMatches])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Saved Reports</h1>
          <p className="text-sm text-slate-400">History of scouts sent from the Match Report reader.</p>
        </div>
        <button
          type="button"
          onClick={fetchMatches}
          className="btn-secondary"
          disabled={loading}
        >
          {loading ? 'Updating...' : 'Update List'}
        </button>
      </header>

      {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {loading ? (
        <p className="text-slate-400">Loading reports...</p>
      ) : matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 px-6 py-8 text-center text-slate-400">
          No reports to show.
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {matches.map((match) => (
            <li
              key={match.matchId}
              className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-lg shadow-black/20 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{resolveDisplayDate(match)} • {resolveDisplayTime(match)}</p>
                <p className="text-lg font-semibold text-slate-100">{buildTeamsLabel(match.teams)}</p>
                <p className="text-xs text-slate-500">Sets: {match.setColumns}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/matches/${match.matchId}`}
                  className="btn-primary"
                >
                  Ver detalhes
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SavedMatches
