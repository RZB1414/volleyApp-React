import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '@/services/api.js'

const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })
const TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

const savedMatchesCache = {
  ready: false,
  items: [],
}

const resolveDisplayDate = (match) => {
  if (!match) return ''
  const source = match.matchDate || match.generatedAt
  if (!source) return ''
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return ''
  return DATE_FORMATTER.format(date)
}

const resolveDisplayTime = (match) => {
  if (!match) return ''
  if (match.matchTime) return match.matchTime
  const source = match.matchDate || match.generatedAt
  if (!source) return ''
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return ''
  return TIME_FORMATTER.format(date)
}

const buildTeamsLabel = (teams = []) => {
  if (!Array.isArray(teams) || !teams.length) return 'Teams not informed'
  return teams.map((team) => team.team).filter(Boolean).join(' - ')
}

const SavedMatches = () => {
  const [matches, setMatches] = useState(savedMatchesCache.ready ? savedMatchesCache.items : [])
  const [loading, setLoading] = useState(!savedMatchesCache.ready)
  const [error, setError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const notifyReportsChanged = useCallback((detail = {}) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('matchreport:deleted', { detail }))
  }, [])

  const fetchMatches = useCallback(async ({ force = false } = {}) => {
    if (!force && savedMatchesCache.ready) {
      setMatches(savedMatchesCache.items)
      setError(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await api.stats.listMatchReports({ limit: 20 })
      const items = Array.isArray(response?.items) ? response.items : []
      items.sort((a, b) => new Date(b.matchDate || b.generatedAt || b.createdAt || 0) - new Date(a.matchDate || a.generatedAt || a.createdAt || 0))
      savedMatchesCache.ready = true
      savedMatchesCache.items = items
      setMatches(items)
    } catch (err) {
      savedMatchesCache.ready = false
      setError(err?.message || 'Failed to load saved reports...')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (savedMatchesCache.ready) {
      setMatches(savedMatchesCache.items)
      setLoading(false)
      return
    }
    fetchMatches({ force: true })
  }, [fetchMatches])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleMatchSaved = () => {
      savedMatchesCache.ready = false
      fetchMatches({ force: true })
    }
    window.addEventListener('matchreport:saved', handleMatchSaved)
    window.addEventListener('matchreport:deleted', handleMatchSaved)
    return () => {
      window.removeEventListener('matchreport:saved', handleMatchSaved)
      window.removeEventListener('matchreport:deleted', handleMatchSaved)
    }
  }, [fetchMatches])

  const handleDelete = useCallback(async (match) => {
    if (!match?.matchId) return
    const teamsLabel = buildTeamsLabel(match.teams)
    const confirmed = typeof window === 'undefined' ? true : window.confirm(`Excluir o relatorio de ${teamsLabel}?`)
    if (!confirmed) return

    try {
      setDeletingId(match.matchId)
      setError(null)
      await api.stats.deleteMatchReport(match.matchId)
      setMatches((prev) => {
        const next = prev.filter((item) => item.matchId !== match.matchId)
        savedMatchesCache.ready = true
        savedMatchesCache.items = next
        return next
      })
      savedMatchesCache.ready = false
      await fetchMatches({ force: true })
      notifyReportsChanged({ matchId: match.matchId })
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('Voce nao pode excluir este relatorio. Apenas o proprietario tem acesso a essa acao.')
      } else if (err instanceof ApiError && err.status === 404) {
        setError('Este relatorio ja havia sido removido.')
        setMatches((prev) => {
          const next = prev.filter((item) => item.matchId !== match.matchId)
          savedMatchesCache.ready = true
          savedMatchesCache.items = next
          return next
        })
      } else {
        setError(err?.message || 'Falha ao excluir o relatorio. Tente novamente mais tarde.')
      }
    } finally {
      setDeletingId(null)
    }
  }, [fetchMatches, notifyReportsChanged])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Saved Reports</h1>
          <p className="text-sm text-slate-400">History of scouts sent from the Match Report reader.</p>
        </div>
        <button
          type="button"
          onClick={() => fetchMatches({ force: true })}
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
          {matches.map((match) => {
            const deleting = deletingId === match.matchId
            return (
              <li
                key={match.matchId}
                className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-lg shadow-black/20 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{resolveDisplayDate(match)}  {resolveDisplayTime(match)}</p>
                  <p className="text-lg font-semibold text-slate-100">{buildTeamsLabel(match.teams)}</p>
                  <p className="text-xs text-slate-500">Sets: {match.setColumns}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/matches/${match.matchId}`}
                    className={`btn-primary ${deleting ? 'pointer-events-none opacity-50' : ''}`}
                    aria-disabled={deleting}
                  >
                    Ver detalhes
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(match)}
                    className="inline-flex items-center rounded-full border border-red-500 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={deleting || loading}
                  >
                    {deleting ? 'Excluindo...' : 'Excluir'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default SavedMatches
