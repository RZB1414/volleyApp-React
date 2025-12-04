import { useEffect, useMemo, useRef, useState } from 'react'
import PageSection from '@/components/PageSection.js'
import { useAuth } from '@/hooks/useAuth.js'
import { countries } from '@/data/countries.js'
import { ApiError, api } from '@/services/api.js'
import { buildProfileUpdatePayload, sanitizePlayerNumber } from '@/utils/profileUpdate.js'

const Profile = () => {
  const { user, updateUserProfile } = useAuth()
  const [editingTeam, setEditingTeam] = useState(false)
  const [teamDraft, setTeamDraft] = useState(user?.actualTeam ?? user?.currentTeam ?? '')
  const [teamCountryDraft, setTeamCountryDraft] = useState(user?.currentTeamCountry ?? null)
  const [playerNumberDraft, setPlayerNumberDraft] = useState(sanitizePlayerNumber(user?.playerNumber))
  const [countryQuery, setCountryQuery] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [editingStartYear, setEditingStartYear] = useState(false)
  const [startYearDraft, setStartYearDraft] = useState('')
  const [savingStartYear, setSavingStartYear] = useState(false)
  const [startYearError, setStartYearError] = useState(null)
  const teamInputRef = useRef(null)
  const currentTeamName = user?.actualTeam ?? user?.currentTeam ?? ''
  const currentPlayerNumber = sanitizePlayerNumber(user?.playerNumber)
  const { volleyballYearsPlayed, volleyballStartYear } = useMemo(() => {
    const rawValue = user?.yearsAsAProfessional
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return { volleyballYearsPlayed: null, volleyballStartYear: null }
    }
    const numeric = Number(rawValue)
    if (!Number.isFinite(numeric)) {
      return { volleyballYearsPlayed: null, volleyballStartYear: null }
    }
    const currentYear = new Date().getFullYear()
    if (numeric >= 1900 && numeric <= currentYear) {
      const years = currentYear - numeric
      return { volleyballYearsPlayed: years >= 0 ? years : null, volleyballStartYear: numeric }
    }
    if (numeric >= 0 && numeric <= 80) {
      return { volleyballYearsPlayed: numeric, volleyballStartYear: currentYear - numeric }
    }
    return { volleyballYearsPlayed: null, volleyballStartYear: null }
  }, [user?.yearsAsAProfessional])

  const stats = [
    { key: 'age', label: 'Age', value: user?.age ?? '—' },
    {
      key: 'volleyballExperience',
      label: 'Anos de vôlei',
      value: volleyballYearsPlayed ?? '—',
      helper: volleyballStartYear ? `Iniciou em ${volleyballStartYear}` : null,
    },
    { key: 'currentTeam', label: 'Current team', value: currentTeamName || '—' },
    { key: 'playerNumber', label: 'Jersey number', value: currentPlayerNumber || '—' },
  ]

  const filteredCountries = useMemo(() => {
    if (!countryQuery.trim()) return []
    const query = countryQuery.trim().toLowerCase()
    return countries.filter((country) => country.name.toLowerCase().includes(query)).slice(0, 8)
  }, [countryQuery])

  const startEditingTeam = () => {
    setTeamDraft(currentTeamName)
    setTeamCountryDraft(user?.currentTeamCountry ?? null)
    setPlayerNumberDraft(currentPlayerNumber)
    setCountryQuery('')
    setSaveError(null)
    setFieldErrors({})
    setEditingTeam(true)
  }

  const cancelEditingTeam = () => {
    setTeamDraft(currentTeamName)
    setTeamCountryDraft(user?.currentTeamCountry ?? null)
    setPlayerNumberDraft(currentPlayerNumber)
    setCountryQuery('')
    setSaveError(null)
    setFieldErrors({})
    setEditingTeam(false)
  }

  const profileUpdatePlan = useMemo(
    () =>
      buildProfileUpdatePayload({
        currentUser: user,
        teamDraft,
        teamCountryDraft,
        playerNumberDraft,
      }),
    [playerNumberDraft, teamCountryDraft, teamDraft, user],
  )

  const saveTeam = async () => {
    if (!profileUpdatePlan.hasChanges) {
      setEditingTeam(false)
      return
    }
    const payload = profileUpdatePlan.payload

    try {
      setSavingProfile(true)
      setSaveError(null)
      setFieldErrors({})
      const response = await api.auth.updateProfile(payload)
      if (response?.user) {
        updateUserProfile(response.user)
      }
      setEditingTeam(false)
    } catch (error) {
      const message = error?.message || 'Não foi possível salvar suas alterações.'
      setSaveError(message)
      if (error instanceof ApiError && error.status === 400) {
        setFieldErrors(error.errors || {})
      } else {
        setFieldErrors({})
      }
    } finally {
      setSavingProfile(false)
    }
  }

  useEffect(() => {
    if (editingTeam) {
      requestAnimationFrame(() => teamInputRef.current?.focus())
    }
  }, [editingTeam])

  useEffect(() => {
    if (editingTeam) return
    setTeamDraft(currentTeamName)
    setTeamCountryDraft(user?.currentTeamCountry ?? null)
    setPlayerNumberDraft(currentPlayerNumber)
  }, [currentPlayerNumber, currentTeamName, editingTeam, user?.currentTeamCountry])

  useEffect(() => {
    if (editingStartYear) return
    setStartYearDraft(volleyballStartYear ? String(volleyballStartYear) : '')
  }, [editingStartYear, volleyballStartYear])


  const handleCountrySelect = (country) => {
    setTeamCountryDraft(country)
    setCountryQuery('')
  }

  const clearCountry = () => {
    setTeamCountryDraft(null)
  }

  const handlePlayerNumberChange = (event) => {
    setPlayerNumberDraft(sanitizePlayerNumber(event.target.value))
  }

  const startEditingStartYear = () => {
    setStartYearDraft(volleyballStartYear ? String(volleyballStartYear) : '')
    setStartYearError(null)
    setEditingStartYear(true)
  }

  const cancelStartYearEdit = () => {
    setStartYearDraft(volleyballStartYear ? String(volleyballStartYear) : '')
    setStartYearError(null)
    setEditingStartYear(false)
  }

  const handleStartYearChange = (event) => {
    const digitsOnly = event.target.value.replace(/[^0-9]/g, '').slice(0, 4)
    setStartYearDraft(digitsOnly)
    setStartYearError(null)
  }

  const saveStartYear = async () => {
    const trimmed = startYearDraft.trim()
    const currentYear = new Date().getFullYear()
    if (!trimmed) {
      setStartYearError('Informe o ano em que começou a jogar.')
      return
    }
    const numericYear = Number(trimmed)
    if (Number.isNaN(numericYear) || numericYear < 1950 || numericYear > currentYear) {
      setStartYearError(`Ano deve estar entre 1950 e ${currentYear}.`)
      return
    }
    try {
      setSavingStartYear(true)
      setStartYearError(null)
      await api.auth.updateProfile({ yearsAsAProfessional: numericYear })
      updateUserProfile((prev) => ({ ...prev, yearsAsAProfessional: numericYear }))
      setEditingStartYear(false)
    } catch (error) {
      setStartYearError(error?.message || 'Não foi possível salvar o ano informado.')
    } finally {
      setSavingStartYear(false)
    }
  }

  const formatFieldError = (error) => {
    if (!error) return ''
    if (typeof error === 'string') return error
    if (Array.isArray(error)) return error.filter(Boolean).join(', ')
    if (typeof error === 'object') {
      return Object.values(error)
        .flat()
        .filter(Boolean)
        .join(', ')
    }
    return String(error)
  }

  const renderFieldError = (field) => {
    const fields = Array.isArray(field) ? field : [field]
    const message = fields
      .map((key) => formatFieldError(fieldErrors?.[key]))
      .filter(Boolean)
      .join(' ')
    return message ? (
      <p className="text-xs text-rose-400" role="alert">{message}</p>
    ) : null
  }

  return (
    <div className="flex flex-col gap-6">
      <PageSection title="Welcome" description={`Hello, ${user?.name || 'user'}! Here is your dashboard overview.`}>
        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((item) => (
            <div key={item.key} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-widest text-slate-400">{item.label}</p>
              {item.key === 'volleyballExperience' ? (
                editingStartYear ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="start-year-input">
                      Ano inicial
                    </label>
                    <input
                      id="start-year-input"
                      type="text"
                      inputMode="numeric"
                      value={startYearDraft}
                      onChange={handleStartYearChange}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                      placeholder="Ex.: 2010"
                      maxLength={4}
                    />
                    {startYearError && (
                      <p className="text-xs text-rose-400" role="alert">{startYearError}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={saveStartYear}
                        disabled={savingStartYear}
                      >
                        {savingStartYear ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button type="button" className="btn-secondary" onClick={cancelStartYearEdit} disabled={savingStartYear}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-2xl font-semibold text-white">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="rounded-full border border-slate-700 bg-transparent p-2 text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
                        onClick={startEditingStartYear}
                        aria-label="Editar ano inicial"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
                          <path d="M14.06 6.19l3.75 3.75L21 6.75 17.25 3z" />
                        </svg>
                      </button>
                      <span>{item.value}</span>
                    </div>
                    {item.helper && <p className="mt-1 text-xs font-normal uppercase tracking-wide text-slate-400">{item.helper}</p>}
                  </div>
                )
              ) : item.key === 'currentTeam' ? (
                editingTeam ? (
                  <div className="mt-2 flex flex-col gap-3">
                    <input
                      ref={teamInputRef}
                      type="text"
                      value={teamDraft}
                      onChange={(event) => setTeamDraft(event.target.value)}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                      placeholder="Add your team name"
                    />
                    {renderFieldError(['actualTeam', 'currentTeam'])}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Jersey number</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={playerNumberDraft}
                        onChange={handlePlayerNumberChange}
                        className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                        placeholder="Ex.: 12"
                        maxLength={3}
                      />
                      <p className="text-xs text-slate-500">Limpe o campo para remover o número exibido em seus relatórios.</p>
                      {renderFieldError('playerNumber')}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={saveTeam}
                        disabled={savingProfile || !profileUpdatePlan.hasChanges}
                      >
                        {savingProfile ? 'Saving...' : 'Save'}
                      </button>
                      <button type="button" className="btn-secondary" onClick={cancelEditingTeam}>
                        Cancel
                      </button>
                      {saveError && (
                        <p className="text-xs text-rose-400" role="alert">{saveError}</p>
                      )}
                      {teamCountryDraft && (
                        <div className="flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-900/60 px-2 py-1 text-xs text-slate-300">
                          <img src={teamCountryDraft.flag} alt={`${teamCountryDraft.name} flag`} className="h-4 w-4 rounded-full object-cover" loading="lazy" />
                          <span>{teamCountryDraft.name}</span>
                          <button type="button" className="text-slate-500 transition hover:text-rose-300" onClick={clearCountry}>
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Team country</label>
                      <div className="relative mt-2">
                        <input
                          type="text"
                          value={countryQuery}
                          onChange={(event) => setCountryQuery(event.target.value)}
                          placeholder="Type a country name"
                          className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
                        />
                        {countryQuery && filteredCountries.length > 0 && (
                          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/95 text-sm text-slate-100 shadow-xl">
                            {filteredCountries.map((country) => (
                              <li key={country.code}>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/70"
                                  onClick={() => handleCountrySelect(country)}
                                >
                                  <img src={country.flag} alt="" className="h-4 w-4 rounded-full object-cover" loading="lazy" />
                                  <span>{country.name}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {!teamCountryDraft && !countryQuery && <p className="mt-2 text-xs text-slate-500">Start typing to link a country.</p>}
                      {teamCountryDraft && (
                        <p className="mt-2 text-xs text-slate-400">Current selection: {teamCountryDraft.name}</p>
                      )}
                      {renderFieldError(['country', 'currentTeamCountryCode', 'currentTeamCountry'])}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-3 text-2xl font-semibold text-white">
                    <button
                      type="button"
                      className="rounded-full border border-slate-700 bg-transparent p-2 text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
                      onClick={startEditingTeam}
                      aria-label="Edit current team"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
                        <path d="M14.06 6.19l3.75 3.75L21 6.75 17.25 3z" />
                      </svg>
                    </button>
                    <span className="flex items-center gap-3 text-base font-semibold">
                      {user?.currentTeamCountry && (
                        <img src={user.currentTeamCountry.flag} alt={`${user.currentTeamCountry.name} flag`} className="h-6 w-6 rounded-full object-cover" loading="lazy" />
                      )}
                      <span className="text-2xl">{item.value}</span>
                    </span>
                  </div>
                )
              ) : item.key === 'playerNumber' ? (
                <div className="mt-2 flex items-center gap-3 text-2xl font-semibold text-white">
                  <button
                    type="button"
                    className="rounded-full border border-slate-700 bg-transparent p-2 text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
                    onClick={startEditingTeam}
                    aria-label="Edit jersey number"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
                      <path d="M14.06 6.19l3.75 3.75L21 6.75 17.25 3z" />
                    </svg>
                  </button>
                  <span className="text-2xl">{item.value}</span>
                </div>
              ) : (
                <div className="mt-2 text-2xl font-semibold text-white">
                  <p>{item.value}</p>
                  {item.helper && <p className="mt-1 text-xs font-normal uppercase tracking-wide text-slate-400">{item.helper}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      </PageSection>
    </div>
  )
}

export default Profile
