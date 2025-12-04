import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, api, configureAuthObserver } from '@/services/api.js'
import { countries } from '@/data/countries.js'
import { normalizeTeamHistoryFromApi } from '@/utils/teamHistory.js'
import { AuthContext } from './AuthContext'

const storageKeys = {
  token: 'volleyplus_access_token',
  user: 'volleyplus_user',
  headers: 'volleyplus_headers',
}

const userFieldDefaults = {
  id: null,
  name: null,
  email: null,
  age: null,
  currentTeam: null,
  country: null,
  currentTeamCountry: null,
  yearsAsAProfessional: null,
  playerNumber: null,
  createdAt: null,
  updatedAt: null,
  teamHistory: [],
}

const safeGet = (key, fallback = null) => {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const safeSet = (key, value) => {
  if (typeof window === 'undefined') return
  if (value === null || value === undefined) {
    window.localStorage.removeItem(key)
    return
  }
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  window.localStorage.setItem(key, serialized)
}

const findCountryEntry = (value) => {
  if (!value || typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  return (
    countries.find((country) => country.code.toLowerCase() === normalized) ||
    countries.find((country) => country.name.toLowerCase() === normalized)
  ) ?? null
}

const normalizePlayerNumber = (value) => {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  if (!normalized) return null
  const digitsOnly = normalized.replace(/[^0-9]/g, '')
  return digitsOnly.slice(0, 3) || null
}

const normalizeUserProfile = (user) => {
  if (!user) return null
  const hydrated = { ...userFieldDefaults, ...user }
  const normalizedTeam = typeof hydrated.currentTeam === 'string' ? hydrated.currentTeam.trim() : null
  const normalizedCountry = typeof hydrated.country === 'string' ? hydrated.country.trim() : null
  const countrySource = (() => {
    if (typeof hydrated.currentTeamCountry === 'string') return hydrated.currentTeamCountry
    if (hydrated.currentTeamCountry?.code) return hydrated.currentTeamCountry.code
    if (hydrated.currentTeamCountry?.name) return hydrated.currentTeamCountry.name
    if (normalizedCountry) return normalizedCountry
    return null
  })()
  const countryEntry = countrySource ? findCountryEntry(countrySource) : null
  const normalizedCountryEntry = countryEntry ?? (countrySource ? { name: countrySource, code: countrySource, flag: null } : null)
  const playerNumber = normalizePlayerNumber(hydrated.playerNumber)
  const normalizedYears = (() => {
    const years = hydrated.yearsAsAProfessional
    if (years === null || years === undefined) return null
    const numeric = typeof years === 'number' ? years : Number(years)
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
  })()
  const teamHistory = normalizeTeamHistoryFromApi(hydrated.teamHistory)

  return {
    ...hydrated,
    currentTeam: normalizedTeam,
    country: normalizedCountryEntry?.code ?? normalizedCountry ?? null,
    currentTeamCountry: normalizedCountryEntry,
    yearsAsAProfessional: normalizedYears,
    playerNumber,
    teamHistory,
  }
}

export const AuthProvider = ({ children }) => {
  const [accessToken, setAccessToken] = useState(() => (typeof window === 'undefined' ? null : window.localStorage.getItem(storageKeys.token)))
  const [user, setUser] = useState(() => normalizeUserProfile(safeGet(storageKeys.user)))
  const [loading, setLoading] = useState(Boolean(accessToken))
  const [error, setError] = useState(null)
  const [headerOverrides, setHeaderOverrides] = useState(() => safeGet(storageKeys.headers, {}))

  const persistSession = useCallback((nextUser, nextToken) => {
    const normalizedUser = normalizeUserProfile(nextUser)
    setUser(normalizedUser)
    setAccessToken(nextToken)
    if (typeof window !== 'undefined') {
      if (nextToken) {
        window.localStorage.setItem(storageKeys.token, nextToken)
      } else {
        window.localStorage.removeItem(storageKeys.token)
      }
    }
    safeSet(storageKeys.user, normalizedUser)
    return normalizedUser
  }, [])

  const persistHeaderOverrides = useCallback((overrides) => {
    setHeaderOverrides(overrides)
    safeSet(storageKeys.headers, overrides)
  }, [])

  const logout = useCallback(() => {
    persistSession(null, null)
    persistHeaderOverrides({})
  }, [persistHeaderOverrides, persistSession])

  useEffect(() => {
    configureAuthObserver(() => ({ token: accessToken, user, headerOverrides }))
  }, [accessToken, headerOverrides, user])

  useEffect(() => {
    if (!accessToken) {
      setLoading(false)
      return
    }

    let active = true
    ;(async () => {
      try {
        const profile = await api.auth.me()
        if (active) {
          persistSession(profile.user, accessToken)
          setError(null)
        }
      } catch (err) {
        console.error('Failed to fetch profile', err)
        if (err instanceof ApiError && err.status === 401) {
          logout()
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [accessToken, logout, persistSession])

  const handleAuthResponse = useCallback(
    (response) => {
      if (!response) return null
      const normalizedUser = persistSession(response.user, response.accessToken)
      persistHeaderOverrides({ userId: response.user?.id ?? response.user?._id ?? null, email: response.user?.email ?? null })
      return normalizedUser
    },
    [persistHeaderOverrides, persistSession],
  )

  const register = useCallback(
    async (payload) => {
      setError(null)
      const response = await api.auth.register(payload)
      return handleAuthResponse(response)
    },
    [handleAuthResponse],
  )

  const login = useCallback(
    async (payload) => {
      setError(null)
      const response = await api.auth.login(payload)
      return handleAuthResponse(response)
    },
    [handleAuthResponse],
  )

  const refreshProfile = useCallback(async () => {
    if (!accessToken) return null
    const profile = await api.auth.me()
    return persistSession(profile.user, accessToken)
  }, [accessToken, persistSession])

  const updateUserProfile = useCallback(
    (updater) => {
      const baseUser = user ?? {}
      const draft = typeof updater === 'function' ? updater(baseUser) : updater
      if (!draft) return null
      const tokenToPersist = accessToken ?? null
      return persistSession(draft, tokenToPersist)
    },
    [accessToken, persistSession, user],
  )

  const value = useMemo(
    () => ({
      user,
      accessToken,
      loading,
      error,
      login,
      register,
      logout,
      refreshProfile,
      updateUserProfile,
      isAuthenticated: Boolean(accessToken),
      userId: headerOverrides?.userId ?? user?.id ?? user?._id ?? null,
      userEmail: headerOverrides?.email ?? user?.email ?? null,
      setHeaderOverrides: persistHeaderOverrides,
    }),
    [accessToken, error, headerOverrides?.email, headerOverrides?.userId, loading, login, logout, persistHeaderOverrides, refreshProfile, register, updateUserProfile, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
