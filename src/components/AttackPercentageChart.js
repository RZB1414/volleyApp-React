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
const STAT_PRIORITY = ['Pts%', 'Attack', 'Ataque', 'Exc%', 'Tot', 'Vote', 'Total Err Points']
const EXCLUDED_STAT_KEYS = new Set(['vote', '1', '2', '3', '4', '5'])
const TOTAL_ERROR_METRIC = 'Total Err Points'
const TOTAL_ERROR_COMPONENTS = ['Attacks Err', 'Attacks Blocked', 'Receptions Err', 'Serves Err']
const SERVES_ERR_PER_PTS_METRIC = 'Serves Err / Serves Pts'
const PRESET_OPTIONS = [
  {
    label: 'Total Err Points + Points Tot + Attacks Pts%',
    metrics: [TOTAL_ERROR_METRIC, 'Points Tot', 'Attacks Pts%'],
  },
  {
    label: 'Serves Tot + Serves Pts + Serves Err',
    metrics: ['Serves Tot', 'Serves Pts', 'Serves Err', SERVES_ERR_PER_PTS_METRIC],
  },
]

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

const computeTotalErrorPoints = (stats = {}) =>
  TOTAL_ERROR_COMPONENTS.reduce((total, key) => total + parseStatValue(stats?.[key]), 0)

const computeServesErrPerPts = (stats = {}) => {
  const servesPts = parseStatValue(stats?.['Serves Pts'])
  const servesErr = parseStatValue(stats?.['Serves Err'])
  if (!servesPts) return servesErr || 0
  return servesErr / servesPts
}

const resolveStatValue = (statKey, stats = {}) => {
  if (statKey === TOTAL_ERROR_METRIC) return computeTotalErrorPoints(stats)
  if (statKey === SERVES_ERR_PER_PTS_METRIC) return computeServesErrPerPts(stats)
  return parseStatValue(stats?.[statKey])
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

const ChartTooltipContent = ({
  active,
  payload,
  label,
  tooltipEnabled,
  formatValue,
  onStatsChange,
  fallbackStats,
}) => {
  const shouldRender = tooltipEnabled && Boolean(active && payload?.length)

  useEffect(() => {
    if (typeof onStatsChange !== 'function') return
    if (shouldRender) {
      const hoveredStats = payload?.[0]?.payload?.__stats || null
      onStatsChange(hoveredStats || null)
      return
    }
    onStatsChange(fallbackStats || null)
  }, [fallbackStats, onStatsChange, payload, shouldRender])

  if (!shouldRender) {
    return null
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100">
      <p className="font-semibold">{label}</p>
      <ul className="mt-1 space-y-1">
        {payload.map((entry) => (
          <li key={entry.dataKey} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span>
              {entry.dataKey}: {formatValue(entry.value, entry.dataKey)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const AttackPercentageChart = ({ matchLimit = DEFAULT_MATCH_LIMIT, onDataStateChange }) => {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [selectedStats, setSelectedStats] = useState([])
  const [statMenuOpen, setStatMenuOpen] = useState(false)
  const statMenuRef = useRef(null)
  const chartContainerRef = useRef(null)
  const legendStatsRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tooltipEnabled, setTooltipEnabled] = useState(true)
  const [legendStats, setLegendStats] = useState(null)

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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleMatchSaved = () => {
      fetchReports()
    }
    window.addEventListener('matchreport:saved', handleMatchSaved)
    return () => {
      window.removeEventListener('matchreport:saved', handleMatchSaved)
    }
  }, [fetchReports])

  const playerFilter = useMemo(() => resolvePlayerFilter(user), [user])

  const playerHistory = useMemo(
    () => buildPlayerHistory(reports, playerFilter),
    [reports, playerFilter],    
  )  

  const statOptions = useMemo(() => {
    const filtered = playerHistory.statKeys.filter((label) => !EXCLUDED_STAT_KEYS.has((label || '').toLowerCase()))
    const hasErrorComponents = playerHistory.statKeys.some((label) => TOTAL_ERROR_COMPONENTS.includes(label))
    const hasServesErrAndPts = playerHistory.statKeys.includes('Serves Err') && playerHistory.statKeys.includes('Serves Pts')
    const derived = [...filtered]
    if (hasErrorComponents) derived.push(TOTAL_ERROR_METRIC)
    if (hasServesErrAndPts) derived.push(SERVES_ERR_PER_PTS_METRIC)
    return sortStatKeys(derived)
  }, [playerHistory.statKeys])

  useEffect(() => {
    if (!statOptions.length) {
      setSelectedStats([])
      return
    }
    const firstAvailablePreset = PRESET_OPTIONS.find((preset) =>
      preset.metrics.every((metric) => statOptions.includes(metric)),
    )
    setSelectedStats((prev) => {
      const next = prev.filter((stat) => statOptions.includes(stat))
      if (next.length) return next
      if (firstAvailablePreset) return firstAvailablePreset.metrics
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

  const latestRowStats = useMemo(() => (chartRows.length ? chartRows[chartRows.length - 1].stats : null), [chartRows])

  const updateLegendStats = useCallback((stats) => {
    if (legendStatsRef.current !== stats) {
      legendStatsRef.current = stats
      setLegendStats(stats)
    }
  }, [])

  useEffect(() => {
    updateLegendStats(latestRowStats || null)
  }, [latestRowStats, updateLegendStats])

  const chartData = useMemo(() => {
    if (!selectedStats.length) return []
    return chartRows.map((row) => {
      const entry = { matchId: row.matchId, label: row.label }
      selectedStats.forEach((statKey) => {
        entry[statKey] = resolveStatValue(statKey, row.stats)
      })
      entry.__stats = row.stats
      return entry
    })
  }, [chartRows, selectedStats])

  const formatValue = useCallback((value, statKey) => {
    if (value === null || value === undefined) return '0'
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return '0'
    if (statKey === SERVES_ERR_PER_PTS_METRIC) {
      return numeric.toFixed(2)
    }
    if (statKey?.includes('%')) {
      return `${numeric.toFixed(2)}%`
    }
    return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2)
  }, [])

  const averageStats = useMemo(() => {
    if (!selectedStats.length || !chartRows.length) return []

    const totals = selectedStats.reduce((acc, key) => {
      if (key !== SERVES_ERR_PER_PTS_METRIC) {
        acc[key] = 0
      }
      return acc
    }, {})

    const includesServesRatio = selectedStats.includes(SERVES_ERR_PER_PTS_METRIC)
    let totalServesErr = 0
    let totalServesPts = 0

    chartRows.forEach((row) => {
      const stats = row.stats
      selectedStats.forEach((statKey) => {
        if (statKey === SERVES_ERR_PER_PTS_METRIC) return
        const value = resolveStatValue(statKey, stats)
        totals[statKey] = (totals[statKey] || 0) + value
      })
      if (includesServesRatio) {
        totalServesErr += parseStatValue(stats?.['Serves Err'])
        totalServesPts += parseStatValue(stats?.['Serves Pts'])
      }
    })

    const gamesCount = chartRows.length
    const averages = new Map()
    Object.entries(totals).forEach(([key, sum]) => {
      averages.set(key, gamesCount ? sum / gamesCount : 0)
    })

    return selectedStats.map((statKey) => {
      if (statKey === SERVES_ERR_PER_PTS_METRIC) {
        if (!includesServesRatio) return { key: statKey, value: 0 }

        const servesErrAvg = averages.get('Serves Err')
        const servesPtsAvg = averages.get('Serves Pts')

        if (servesErrAvg !== undefined && servesPtsAvg !== undefined) {
          const roundedErr = Number(formatValue(servesErrAvg, 'Serves Err'))
          const roundedPts = Number(formatValue(servesPtsAvg, 'Serves Pts'))
          if (roundedPts) {
            return { key: statKey, value: roundedErr / roundedPts }
          }
          return { key: statKey, value: roundedErr || 0 }
        }

        const ratio = totalServesPts ? totalServesErr / totalServesPts : totalServesErr || 0
        return { key: statKey, value: ratio }
      }

      return {
        key: statKey,
        value: averages.get(statKey) ?? 0,
      }
    })
  }, [chartRows, formatValue, selectedStats])

  const totalErrorComponentColors = useMemo(() => {
    const baseOffset = selectedStats.length % LINE_COLORS.length
    return TOTAL_ERROR_COMPONENTS.reduce((acc, component, idx) => {
      const selectedIndex = selectedStats.indexOf(component)
      if (selectedIndex !== -1) {
        acc[component] = LINE_COLORS[selectedIndex % LINE_COLORS.length]
      } else {
        acc[component] = LINE_COLORS[(baseOffset + idx) % LINE_COLORS.length]
      }
      return acc
    }, {})
  }, [selectedStats])

  const missingPlayerNumber = !playerFilter.number
  const displayName = playerHistory.playerName || user?.name || 'seu atleta'
  const isEmptyState = !loading && (!chartData.length || !selectedStats.length)
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

  const applyPresetMetrics = useCallback((metrics) => {
    if (!statOptions.length || !metrics?.length) return
    const availablePreset = metrics.filter((metric) => statOptions.includes(metric))
    if (!availablePreset.length) return
    setSelectedStats(availablePreset)
  }, [statOptions])

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
              {selectedStats.length ? `${selectedStats.length} selected metrics` : 'Select metrics'}
            </button>
            {statMenuOpen && (
              <div className="absolute right-[-82px] z-20 mt-2 w-44 rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-xl">
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Available Metrics</p>
                <div className="mb-3 space-y-2">
                  {PRESET_OPTIONS.map((preset) => {
                    const disabled = !preset.metrics.every((metric) => statOptions.includes(metric))
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        className="w-full rounded border border-teal-500/40 bg-teal-500/10 px-2 py-1 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => {
                          applyPresetMetrics(preset.metrics)
                          setStatMenuOpen(false)
                        }}
                        disabled={disabled}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
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
            {loading ? 'Reloading...' : 'Reload'}
          </button>
        </div>
      </header>

      {!loading && !isEmptyState && averageStats.length > 0 && (
        <div className="flex justify-end px-4">
          <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200 sm:w-auto sm:min-w-[260px]">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Overall average</p>
                <p className="text-base font-semibold text-slate-100">{chartRows.length} games</p>
              </div>
              <span className="text-xs text-slate-500">{selectedStats.length} metrics</span>
            </div>
            <ul className="mt-3 space-y-2">
              {averageStats.map(({ key, value }) => {
                const colorIndex = selectedStats.indexOf(key)
                const color = LINE_COLORS[colorIndex !== -1 ? colorIndex % LINE_COLORS.length : 0]
                const formattedValue = formatValue(value, key)
                return (
                  <li key={`average-${key}`} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      <span>{key}</span>
                    </div>
                    <span className="font-semibold text-slate-100">{formattedValue}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

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
          className="chart-focus-guard w-full min-w-0 select-none -mx-4 sm:-mx-8 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
          style={{ touchAction: 'none', outline: 'none', boxShadow: 'none', border: 'none' }}
          tabIndex={-1}
          ref={chartContainerRef}
          onPointerDown={handleChartPointerDown}
          onPointerEnter={handleChartPointerDown}
        >
          <div className="h-80 w-full">
            <ResponsiveContainer minWidth={100} minHeight={100}>
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 8, left: -18, bottom: 0 }}
                onMouseLeave={() => updateLegendStats(latestRowStats || null)}
              >
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
                  content={(tooltipProps) => (
                    <ChartTooltipContent
                      {...tooltipProps}
                      tooltipEnabled={tooltipEnabled}
                      formatValue={formatValue}
                      onStatsChange={updateLegendStats}
                      fallbackStats={latestRowStats || null}
                    />
                  )}
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
                      activeDot={{ r: 5, strokeWidth: 2, stroke: '#0f172a', fill: stroke }}
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {(selectedStats.length > 1 || selectedStats.includes(TOTAL_ERROR_METRIC)) && (
            <div className="mb-7 mt-3 flex flex-wrap gap-4 text-xs text-slate-400 pl-4 sm:pl-6">
              {selectedStats.map((statKey, index) => {
                const statsSource = legendStats || latestRowStats
                const legendValue = resolveStatValue(statKey, statsSource || {})
                return (
                  <div key={`${statKey}-legend`} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-6 rounded-full" style={{ backgroundColor: LINE_COLORS[index % LINE_COLORS.length] }} />
                    <span>{statKey}: {formatValue(legendValue, statKey)}</span>
                  </div>
                  {statKey === TOTAL_ERROR_METRIC && (
                    <ul className="ml-4 space-y-1 text-[11px] text-slate-400">
                      {TOTAL_ERROR_COMPONENTS.map((component) => (
                        <li key={`${statKey}-${component}`} className="flex items-center gap-2">
                          <span
                            className="h-2 w-4 rounded-full"
                            style={{ backgroundColor: totalErrorComponentColors[component] }}
                          />
                          <span>
                            {component}: {formatValue(parseStatValue((legendStats || latestRowStats)?.[component]), component)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default AttackPercentageChart
