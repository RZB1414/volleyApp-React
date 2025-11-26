import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '@/services/api.js'
import FormField, { Input } from '@/components/FormField.js'
import PageSection from '@/components/PageSection.js'
import { useAuth } from '@/hooks/useAuth.js'
import { mergeFieldErrors, validateLogin } from '@/utils/formValidators.js'

const LoginPage = () => {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuth()
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [apiMessage, setApiMessage] = useState(null)
  const [logs, setLogs] = useState([])

  const nextLogId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`

  const appendLog = (type, message) => {
    setLogs((prev) => [{ id: nextLogId(), type, message, at: new Date() }, ...prev].slice(0, 5))
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const fieldErrors = validateLogin(values)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length) return

    setSubmitting(true)
    setApiMessage(null)
    try {
      await login(values)
      appendLog('success', 'Login confirmed successfully.')
      navigate('/')
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors((prev) => mergeFieldErrors(prev, error.errors ?? {}))
        setApiMessage(error.message)
        appendLog('error', `Authentication error: ${error.message}`)
      } else {
        setApiMessage('Unexpected error while signing in')
        appendLog('error', 'Unexpected error while signing in user.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageSection
      title="Login"
      description="Access the Volley Plus API admin console"
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <FormField label="Email" error={errors.email} htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="user@email.com"
            value={values.email}
            onChange={handleChange}
            autoComplete="email"
            error={errors.email}
          />
        </FormField>
        <FormField label="Password" error={errors.password} htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Minimum 6 characters"
            value={values.password}
            onChange={handleChange}
            autoComplete="current-password"
            error={errors.password}
          />
        </FormField>
        {apiMessage && <p className="text-sm text-rose-300">{apiMessage}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-400">
        Don't have an account yet?{' '}
        <Link to="/register" className="text-emerald-400 hover:text-emerald-300">
          Sign up here
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

export default LoginPage
