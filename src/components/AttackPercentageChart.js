import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '@/services/api.js'
import { useAuth } from '@/hooks/useAuth.js'


const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short' })
const DEFAULT_MATCH_LIMIT = 12
const LINE_COLORS = ['#2dd4bf', '#f97316', '#38bdf8', '#f472b6', '#a78bfa', '#facc15', '#4ade80']
const STAT_PRIORITY = ['Pts%', 'Attack', 'Ataque', 'Exc%', 'Tot', 'Vote']
const EXCLUDED_STAT_KEYS = new Set(['vote', '1', '2', '3', '4', '5'])

const normalizeName = (value) => {
  if (!value || typeof value !== 'string') return ''
  return value
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
}

const normalizeTeamName = (value) => normalizeName(value)

const normalizePlayerNumber = (value) => {
  if (value === null || value === undefined) return null
  const digits = String(value).replace(/[^0-9]/g, '').trim()
  if (!digits) return null
  const normalized = Number(digits)
  if (Number.isNaN(normalized)) return null
  return String(normalized)
}

const resolvePlayerFilter = (user) => {
  const primaryTeam = user?.currentTeam ?? user?.actualTeam ?? user?.teamHistory?.[0]?.teamName
  const primaryNumber = user?.playerNumber ?? user?.teamHistory?.[0]?.playerNumber
  const teamName = normalizeTeamName(primaryTeam)
  const playerNumber = normalizePlayerNumber(primaryNumber)  

  return {
    team: teamName,
    number: playerNumber,
  }
}

const resolveMatchDate = (report) => {
  const source = report?.matchDate || report?.generatedAt || report?.createdAt
  if (!source) return null
  const value = new Date(source)
  if (Number.isNaN(value.getTime())) return null
  return value
}

const parseStatValue = (value) => {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  const normalized = String(value).replace('%', '').replace(',', '.').trim()
  if (!normalized || normalized === '.' || normalized === '-') return 0
  const numeric = Number(normalized)
  return Number.isNaN(numeric) ? 0 : numeric
}

const buildPlayerHistory = (reports, playerFilter) => {
  if (!playerFilter?.number) {
    return { rows: [], statKeys: [], playerName: null }
  }

  const rows = []
  const statKeys = new Set()
  let detectedName = null

  reports.forEach((report) => {
    const matchDate = resolveMatchDate(report)
    const timestamp = matchDate ? matchDate.getTime() : Date.now()
    const dateLabel = matchDate ? DATE_FORMATTER.format(matchDate) : null
    const baseLabels = Array.isArray(report?.columnLabels)
      ? report.columnLabels.map((label) => (typeof label === 'string' ? label.trim() : '')).filter(Boolean)
      : []

    report?.teams?.forEach((team) => {
      const normalizedTeam = normalizeTeamName(team?.team || team?.teamName || team?.name)
      const shouldMatchByTeam = Boolean(playerFilter.team)
      const teamMatches = (() => {
        if (!shouldMatchByTeam) return true
        if (!normalizedTeam) return true
        if (normalizedTeam === playerFilter.team) return true
        if (normalizedTeam.includes(playerFilter.team)) return true
        if (playerFilter.team.includes(normalizedTeam)) return true
        return false
      })()
      if (!teamMatches) return

      team?.players?.forEach((player) => {
        const playerNumber = normalizePlayerNumber(player?.number)
        const numberMatches = Boolean(playerNumber && playerNumber === playerFilter.number)
        if (!numberMatches) return

        detectedName = player?.name || detectedName
        const labels = baseLabels.length ? baseLabels : Object.keys(player?.stats || {})
        const stats = {}
        labels.forEach((label) => {
          if (!label) return
          const rawValue = player?.stats?.[label]
          if (rawValue !== undefined) {
            stats[label] = rawValue
            statKeys.add(label)
          }
        })

        rows.push({
          matchId: report?.matchId || `${player?.name}-${rows.length + 1}`,
          timestamp,
          dateLabel,
          stats,
        })
      })
    })
  })

  rows.sort((a, b) => a.timestamp - b.timestamp)
  return { rows, statKeys: Array.from(statKeys), playerName: detectedName }
}

const sortStatKeys = (keys) => {
  if (!Array.isArray(keys)) return []
  const priorityMap = new Map(STAT_PRIORITY.map((label, index) => [label.toLowerCase(), index]))
  return [...keys].sort((a, b) => {
    const aKey = (a || '').toLowerCase()
    const bKey = (b || '').toLowerCase()
    const aPriority = priorityMap.has(aKey) ? priorityMap.get(aKey) : Number.POSITIVE_INFINITY
    const bPriority = priorityMap.has(bKey) ? priorityMap.get(bKey) : Number.POSITIVE_INFINITY
    if (aPriority !== bPriority) return aPriority - bPriority
    return a.localeCompare(b, 'pt-BR')
  })
}

const AttackPercentageChart = ({ matchLimit = DEFAULT_MATCH_LIMIT, onDataStateChange }) => {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [selectedStats, setSelectedStats] = useState([])
  const [statMenuOpen, setStatMenuOpen] = useState(false)
  const statMenuRef = useRef(null)
  const chartContainerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tooltipEnabled, setTooltipEnabled] = useState(true)

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.stats.listMatchReports({ limit: matchLimit })      
      const items = Array.isArray(response?.items) ? response.items : []
      const matchIds = items.map((item) => item.matchId).filter(Boolean)

      if (!matchIds.length) {
        setReports([])
        return
      }

      const detailedResults = await Promise.allSettled(
        matchIds.map((matchId) => api.stats.getMatchReport(matchId))
      )      

      const validReports = detailedResults
        .filter((item) => item.status === 'fulfilled' && item.value)
        .map((item) => item.value)

      validReports.sort((a, b) => {
        const dateA = resolveMatchDate(a)?.getTime() || 0
        const dateB = resolveMatchDate(b)?.getTime() || 0
        return dateA - dateB
      })
      

      setReports(validReports)
    } catch (err) {
      setReports([])
      setError(err?.message || 'Falha ao buscar relatórios para o gráfico.')
    } finally {
      setLoading(false)
    }
  }, [matchLimit])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const playerFilter = useMemo(() => resolvePlayerFilter(user), [user])

  const playerHistory = useMemo(
    () => buildPlayerHistory(reports, playerFilter),
    [reports, playerFilter],    
  )  

  const statOptions = useMemo(() => {
    const filtered = playerHistory.statKeys.filter((label) => !EXCLUDED_STAT_KEYS.has((label || '').toLowerCase()))
    return sortStatKeys(filtered)
  }, [playerHistory.statKeys])

  useEffect(() => {
    if (!statOptions.length) {
      setSelectedStats([])
      return
    }
    setSelectedStats((prev) => {
      const next = prev.filter((stat) => statOptions.includes(stat))
      if (next.length) return next
      return [statOptions[0]]
    })
  }, [statOptions])

  const useDateLabel = useMemo(() => playerHistory.rows.length > 1 && playerHistory.rows.some((row) => row.dateLabel), [playerHistory.rows])

  const chartRows = useMemo(
    () =>
      playerHistory.rows.map((row, index) => ({
        matchId: row.matchId,
        label: useDateLabel && row.dateLabel ? row.dateLabel : `Jogo ${index + 1}`,
        stats: row.stats,
      })),
    [playerHistory.rows, useDateLabel],
  )

  const chartData = useMemo(() => {
    if (!selectedStats.length) return []
    return chartRows.map((row) => {
      const entry = { matchId: row.matchId, label: row.label }
      selectedStats.forEach((statKey) => {
        entry[statKey] = parseStatValue(row.stats?.[statKey])
      })
      return entry
    })
  }, [chartRows, selectedStats])

  const missingPlayerNumber = !playerFilter.number
  const displayName = playerHistory.playerName || user?.name || 'seu atleta'
  const isEmptyState = !loading && (!chartData.length || !selectedStats.length)
  const formatValue = useCallback((value, statKey) => {
    if (value === null || value === undefined) return '0'
    const numeric = typeof value === 'number' ? value : Number(value)
    return statKey?.includes('%') ? `${numeric}%` : String(numeric)
  }, [])
  const formatAxisValue = (value) => {
    const primaryStat = selectedStats[0] || ''
    return formatValue(value, primaryStat)
  }

  const toggleStatSelection = (statKey) => {
    setSelectedStats((prev) => {
      const exists = prev.includes(statKey)
      if (exists) {
        const filtered = prev.filter((stat) => stat !== statKey)
        return filtered.length ? filtered : prev
      }
      return [...prev, statKey]
    })
  }

  const handleApplySelection = () => {
    if (!selectedStats.length && statOptions.length) {
      setSelectedStats([statOptions[0]])
    }
    setStatMenuOpen(false)
  }

  useEffect(() => {
    if (!statMenuOpen) return undefined
    const handleClickOutside = (event) => {
      if (statMenuRef.current && !statMenuRef.current.contains(event.target)) {
        setStatMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [statMenuOpen])

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!chartContainerRef.current) return
      if (!chartContainerRef.current.contains(event.target)) {
        setTooltipEnabled(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  const handleChartPointerDown = () => {
    setTooltipEnabled(true)
  }

  const handleChartTouchMove = (event) => {
    event.preventDefault()
  }

  const renderTooltipContent = useCallback(({ active, payload, label }) => {
    if (!tooltipEnabled || !active || !payload?.length) return null
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100">
        <p className="font-semibold">{label}</p>
        <ul className="mt-1 space-y-1">
          {payload.map((entry) => (
            <li key={entry.dataKey} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span>
                {entry.dataKey}: {formatValue(Number(entry.value).toFixed(entry.dataKey.includes('%') ? 1 : 0), entry.dataKey)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }, [formatValue, tooltipEnabled])

  useEffect(() => {
    if (typeof onDataStateChange !== 'function') return
    const hasData = !loading && !isEmptyState
    onDataStateChange({ isLoading: loading, hasData })
  }, [isEmptyState, loading, onDataStateChange])

  return (
    <section className="flex min-w-0 w-full flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-1">
      <header className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">My stats</p>
          <h2 className="text-lg font-semibold text-slate-100">Tracking History {displayName}</h2>
          <p className="text-xs text-slate-500">Select a metric for your chart.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" ref={statMenuRef}>
            <button
              type="button"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
              onClick={() => setStatMenuOpen((prev) => !prev)}
              disabled={loading || !statOptions.length}
            >
              {selectedStats.length ? `${selectedStats.length} métricas selecionadas` : 'Selecione as métricas'}
            </button>
            {statMenuOpen && (
              <div className="absolute right-[-82px] z-20 mt-2 w-44 rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-xl">
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Métricas disponíveis</p>
                <div className="flex max-h-60 flex-col gap-1 overflow-y-auto">
                  {statOptions.map((label) => {
                    const checked = selectedStats.includes(label)
                    return (
                      <label key={label} className="flex items-center gap-2 text-sm text-slate-100">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-teal-400 focus:ring-teal-500"
                          checked={checked}
                          onChange={() => toggleStatSelection(label)}
                        />
                        <span>{label}</span>
                      </label>
                    )
                  })}
                </div>
                <button
                  type="button"
                  className="mt-3 w-full rounded-md bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-400"
                  onClick={handleApplySelection}
                >
                  Show
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={fetchReports}
            className="btn-secondary"
            disabled={loading}
          >
            {loading ? 'Atualizando...' : 'Recarregar'}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {missingPlayerNumber && (
        <p className="text-sm text-slate-400">Informe o número da sua camisa no perfil para conectar os scouts importados.</p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Carregando dados para o gráfico...</p>
      ) : isEmptyState ? (
        <p className="text-sm text-slate-400">Nenhum relatório com estatísticas disponíveis para {displayName}.</p>
      ) : (
        <div
          className="chart-focus-guard h-80 w-full min-w-0 select-none"
          style={{ touchAction: 'none', outline: 'none' }}
          ref={chartContainerRef}
          onPointerDown={handleChartPointerDown}
          onPointerEnter={handleChartPointerDown}
          onTouchMove={handleChartTouchMove}
        >
          <ResponsiveContainer minWidth={100} minHeight={100}>
            <LineChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#1e293b" />
              <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis
                stroke="#94a3b8"
                tick={{ fontSize: 12 }}
                domain={[0, 'auto']}
                tickFormatter={formatAxisValue}
              />
              <Tooltip
                trigger="hover"
                content={renderTooltipContent}
                wrapperStyle={{ outline: 'none', border: 'none', boxShadow: 'none', background: 'transparent' }}
              />
              {selectedStats.map((statKey, index) => {
                const stroke = LINE_COLORS[index % LINE_COLORS.length]
                return (
                  <Line
                    key={statKey}
                    type="monotone"
                    dataKey={statKey}
                    stroke={stroke}
                    name={statKey}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 2, stroke: '#0f172a', fill: stroke }}
                    activeDot={{ r: 5 }}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
          {selectedStats.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
              {selectedStats.map((statKey, index) => (
                <div key={`${statKey}-legend`} className="flex items-center gap-2">
                  <span className="h-2 w-6 rounded-full" style={{ backgroundColor: LINE_COLORS[index % LINE_COLORS.length] }} />
                  <span>{statKey}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default AttackPercentageChart
