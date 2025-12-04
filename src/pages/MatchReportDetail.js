import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import MatchReportTable from '@/components/MatchReportTable.js'
import { ApiError, api } from '@/services/api.js'

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
  if (!Array.isArray(teams) || !teams.length) return 'Times não informados'
  return teams.map((team) => team.team).filter(Boolean).join(' vs ')
}

const MatchReportDetail = () => {
  const { matchId } = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [noReportAvailable, setNoReportAvailable] = useState(false)

  const fetchDetails = useCallback(async () => {
    if (!matchId) return
    try {
      setLoading(true)
      setError(null)
      setNoReportAvailable(false)
      const response = await api.stats.getMatchReport(matchId)
      if (Array.isArray(response) && response.length === 0) {
        setReport(null)
        setNoReportAvailable(true)
        return
      }
      setReport(response)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setReport(null)
        setNoReportAvailable(true)
      } else {
        setError(err?.message || 'Falha ao carregar o relatório solicitado.')
      }
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => {
    fetchDetails()
  }, [fetchDetails])

  const metaDate = resolveDisplayDate(report)
  const metaTime = resolveDisplayTime(report)
  const metaTeams = buildTeamsLabel(report?.teams)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">{metaTeams}</h1>
          <p className="text-sm text-slate-400">{metaDate} • {metaTime}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/matches" className="btn-secondary">Voltar</Link>
          <button type="button" onClick={fetchDetails} className="btn-primary" disabled={loading}>
            {loading ? 'Atualizando...' : 'Recarregar'}
          </button>
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {loading ? (
        <p className="text-slate-400">Carregando relatório...</p>
      ) : noReportAvailable ? (
        <div className="rounded-lg border border-dashed border-slate-700 px-6 py-10 text-center text-slate-400">
          No reports to show.
        </div>
      ) : !report ? (
        <div className="rounded-lg border border-dashed border-slate-700 px-6 py-10 text-center text-slate-400">
          Relatório não encontrado.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          
          <MatchReportTable
            teams={report.teams || []}
            columnLabels={report.columnLabels || []}
            setColumnCount={report.setColumns}
          />
        </div>
      )}
    </div>
  )
}

export default MatchReportDetail
