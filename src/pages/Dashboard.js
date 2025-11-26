import { useEffect, useMemo, useRef, useState } from 'react'
import PageSection from '@/components/PageSection.js'
import { useAuth } from '@/hooks/useAuth.js'
import { countries } from '@/data/countries.js'

const Dashboard = () => {
  const { user, updateUserProfile } = useAuth()
  const [editingTeam, setEditingTeam] = useState(false)
  const [teamDraft, setTeamDraft] = useState(user?.actualTeam ?? user?.currentTeam ?? '')
  const [teamCountryDraft, setTeamCountryDraft] = useState(user?.currentTeamCountry ?? null)
  const [countryQuery, setCountryQuery] = useState('')
  const teamInputRef = useRef(null)

  const stats = [
    { key: 'age', label: 'Age', value: user?.age ?? '—' },
    { key: 'years', label: 'Years as professional', value: user?.yearsAsAProfessional ?? '—' },
    { key: 'currentTeam', label: 'Current team', value: user?.actualTeam ?? user?.currentTeam ?? '—' },
  ]

  const filteredCountries = useMemo(() => {
    if (!countryQuery.trim()) return []
    const query = countryQuery.trim().toLowerCase()
    return countries.filter((country) => country.name.toLowerCase().includes(query)).slice(0, 8)
  }, [countryQuery])

  const startEditingTeam = () => {
    setTeamDraft(user?.actualTeam ?? user?.currentTeam ?? '')
    setTeamCountryDraft(user?.currentTeamCountry ?? null)
    setCountryQuery('')
    setEditingTeam(true)
  }

  const cancelEditingTeam = () => {
    setTeamDraft(user?.actualTeam ?? user?.currentTeam ?? '')
    setTeamCountryDraft(user?.currentTeamCountry ?? null)
    setCountryQuery('')
    setEditingTeam(false)
  }

  const saveTeam = () => {
    const nextTeam = teamDraft.trim()
    updateUserProfile((prev) => ({
      ...prev,
      actualTeam: nextTeam,
      currentTeam: nextTeam,
      country: teamCountryDraft?.code ?? null,
      currentTeamCountry: teamCountryDraft ?? null,
      currentTeamCountryCode: teamCountryDraft?.code ?? null,
    }))
    setEditingTeam(false)
  }

  useEffect(() => {
    if (editingTeam) {
      requestAnimationFrame(() => teamInputRef.current?.focus())
    }
  }, [editingTeam])


  const handleCountrySelect = (country) => {
    setTeamCountryDraft(country)
    setCountryQuery('')
  }

  const clearCountry = () => {
    setTeamCountryDraft(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageSection title="Welcome" description={`Hello, ${user?.name || 'user'}! Here is your dashboard overview.`}>
        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((item) => (
            <div key={item.key} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-widest text-slate-400">{item.label}</p>
              {item.key === 'currentTeam' ? (
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
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={saveTeam}
                        disabled={teamDraft.trim() === (user?.currentTeam ?? '') && teamCountryDraft === (user?.currentTeamCountry ?? null)}
                      >
                        Save
                      </button>
                      <button type="button" className="btn-secondary" onClick={cancelEditingTeam}>
                        Cancel
                      </button>
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
              ) : (
                <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
              )}
            </div>
          ))}
        </div>
      </PageSection>
    </div>
  )
}

export default Dashboard
