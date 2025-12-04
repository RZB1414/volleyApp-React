import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '@/services/api.js'
import FormField, { Input } from '@/components/FormField.js'
import PageSection from '@/components/PageSection.js'
import { useAuth } from '@/hooks/useAuth.js'
import { mergeFieldErrors, validateRegister } from '@/utils/formValidators.js'
import { countries } from '@/data/countries.js'
import { sanitizePlayerNumber, serializeTeamCountry } from '@/utils/profileUpdate.js'

const RegisterPage = () => {
  const navigate = useNavigate()
  const { register, isAuthenticated } = useAuth()
  const [values, setValues] = useState({
    name: '',
    email: '',
    password: '',
    age: '',
    actualTeam: '',
    country: '',
    yearsAsAProfessional: '',
    playerNumber: '',
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [apiMessage, setApiMessage] = useState(null)
  const [logs, setLogs] = useState([])
  const [countryQuery, setCountryQuery] = useState('')

  const nextLogId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`

  const appendLog = (type, message) => {
    setLogs((prev) => [{ id: nextLogId(), type, message, at: new Date() }, ...prev].slice(0, 5))
  }

  const filteredCountries = useMemo(() => {
    if (!countryQuery.trim()) return []
    const query = countryQuery.trim().toLowerCase()
    return countries.filter((country) => country.name.toLowerCase().includes(query)).slice(0, 8)
  }, [countryQuery])

  const selectedCountry = useMemo(() => {
    if (!values.country) return null
    return countries.find((country) => country.code === values.country) ?? null
  }, [values.country])

  const handleCountrySelect = (country) => {
    setValues((prev) => ({ ...prev, country: country.code }))
    setCountryQuery('')
  }

  const handleCountryClear = () => {
    setValues((prev) => ({ ...prev, country: '' }))
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    if (name === 'playerNumber') {
      setValues((prev) => ({ ...prev, playerNumber: sanitizePlayerNumber(value) }))
      return
    }
    if (name === 'yearsAsAProfessional') {
      const digitsOnly = value.replace(/[^0-9]/g, '').slice(0, 4)
      setValues((prev) => ({ ...prev, yearsAsAProfessional: digitsOnly }))
      return
    }
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const fieldErrors = validateRegister(values)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length) return

    setSubmitting(true)
    setApiMessage(null)
    try {
          const normalizedTeam = values.actualTeam?.trim() || undefined
          const serializedCountry = serializeTeamCountry(selectedCountry)
          const currentTeamCountryCode = serializedCountry?.code || undefined
      const sanitizedNumber = sanitizePlayerNumber(values.playerNumber)
      await register({
        ...values,
        age: values.age ? Number(values.age) : undefined,
        actualTeam: normalizedTeam,
        currentTeam: normalizedTeam,
        country: currentTeamCountryCode,
        currentTeamCountryCode,
        currentTeamCountry: serializedCountry || undefined,
        playerNumber: sanitizedNumber || undefined,
        yearsAsAProfessional: values.yearsAsAProfessional !== '' ? Number(values.yearsAsAProfessional) : undefined,
      })
      appendLog('success', 'Registration completed and session started.')
      navigate('/')
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors((prev) => mergeFieldErrors(prev, error.errors ?? {}))
        setApiMessage(error.message)
        appendLog('error', `Error while registering: ${error.message}`)
      } else {
        setApiMessage('Unexpected error while registering')
        appendLog('error', 'Unexpected error while creating account.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageSection title="Create account" description="Enjoy the Volley Plus ecosystem">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <FormField label="Full name" error={errors.name} htmlFor="name">
          <Input id="name" name="name" placeholder="Name" value={values.name} onChange={handleChange} error={errors.name} />
        </FormField>
        <FormField label="Email" error={errors.email} htmlFor="email">
          <Input id="email" name="email" type="email" placeholder="athete@volley.plus" value={values.email} onChange={handleChange} error={errors.email} />
        </FormField>
        <FormField label="Password" error={errors.password} htmlFor="password">
          <Input id="password" name="password" type="password" placeholder="Minimum 9 characters" value={values.password} onChange={handleChange} error={errors.password} />
        </FormField>
        <FormField label="Age" error={errors.age} htmlFor="age">
          <Input id="age" name="age" type="number" min="10" max="100" placeholder="25" value={values.age} onChange={handleChange} error={errors.age} />
        </FormField>
        <FormField label="Ano que comecei a jogar" error={errors.yearsAsAProfessional} htmlFor="yearsAsAProfessional">
          <Input
            id="yearsAsAProfessional"
            name="yearsAsAProfessional"
            type="number"
            min="1950"
            max={new Date().getFullYear()}
            placeholder="Ex.: 2010"
            value={values.yearsAsAProfessional}
            onChange={handleChange}
            error={errors.yearsAsAProfessional}
          />
          <p className="mt-1 text-xs text-slate-500">Informe o ano em que começou no vôlei profissional.</p>
        </FormField>
        <div className="md:col-span-2">
          <FormField label="Current team" error={errors.actualTeam} htmlFor="actualTeam">
            <div className="flex items-center gap-3">
              {selectedCountry && (
                <img src={selectedCountry.flag} alt={`${selectedCountry.name} flag`} className="h-6 w-6 rounded-full object-cover" loading="lazy" />
              )}
              <Input
                id="actualTeam"
                name="actualTeam"
                placeholder="Volley Plus Club"
                value={values.actualTeam}
                onChange={handleChange}
                error={errors.actualTeam}
                className="flex-1"
              />
            </div>
          </FormField>
        </div>
        <FormField label="Jersey number" error={errors.playerNumber} htmlFor="playerNumber">
          <Input
            id="playerNumber"
            name="playerNumber"
            placeholder="Ex.: 12"
            maxLength={3}
            inputMode="numeric"
            value={values.playerNumber}
            onChange={handleChange}
            error={errors.playerNumber}
          />
          <p className="mt-1 text-xs text-slate-500">Deixe em branco para registrar sem número de camisa.</p>
        </FormField>
        <div className="md:col-span-2">
          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-200">
            Team country
            <div className="relative">
              <input
                type="text"
                value={countryQuery}
                onChange={(event) => setCountryQuery(event.target.value)}
                placeholder="Type to search for a country"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-50 placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
              />
              {countryQuery && filteredCountries.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/95 text-sm text-slate-100 shadow-xl">
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
            {selectedCountry ? (
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <span className="flex items-center gap-2 rounded-full border border-slate-800/60 bg-slate-900/50 px-3 py-1">
                  <img src={selectedCountry.flag} alt={`${selectedCountry.name} flag`} className="h-4 w-4 rounded-full object-cover" loading="lazy" />
                  {selectedCountry.name}
                </span>
                <button type="button" className="text-slate-500 transition hover:text-rose-300" onClick={handleCountryClear}>
                  Remove
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Search to link a country to your team.</p>
            )}
          </label>
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create account'}
          </button>
        </div>
      </form>
      {apiMessage && <p className="mt-4 text-sm text-rose-300">{apiMessage}</p>}
      <p className="mt-4 text-sm text-slate-400">
        Already have access?{' '}
        <Link to="/login" className="text-emerald-400 hover:text-emerald-300">
          Sign in
        </Link>
      </p>
      {logs.length > 0 && (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs">
          {logs.map((log) => (
            <p key={log.id} className={log.type === 'success' ? 'text-emerald-300' : 'text-rose-300'}>
              [{log.at.toLocaleTimeString()}] {log.message}
            </p>
          ))}
        </div>
      )}
    </PageSection>
  )
}

export default RegisterPage
