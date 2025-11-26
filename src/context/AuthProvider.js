import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, api, configureAuthObserver } from '@/services/api.js'
import { countries } from '@/data/countries.js'
import { AuthContext } from './AuthContext'

const storageKeys = {
  token: 'volleyplus_access_token',
  user: 'volleyplus_user',
  headers: 'volleyplus_headers',
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

const normalizeUserProfile = (user) => {
  if (!user) return null
  const derivedTeam = user.actualTeam ?? user.currentTeam ?? null
  const rawCountry = (() => {
    if (typeof user.country === 'string' && user.country.trim()) return user.country.trim()
    if (typeof user.currentTeamCountryCode === 'string' && user.currentTeamCountryCode.trim()) {
      return user.currentTeamCountryCode.trim()
    }
    if (typeof user.currentTeamCountry === 'string' && user.currentTeamCountry.trim()) {
      return user.currentTeamCountry.trim()
    }
    if (user.currentTeamCountry?.code) return user.currentTeamCountry.code
    return null
  })()
  const countryEntry = findCountryEntry(rawCountry ?? '')
  return {
    ...user,
    actualTeam: derivedTeam,
    currentTeam: derivedTeam,
    country: rawCountry ?? countryEntry?.code ?? null,
    currentTeamCountryCode: countryEntry?.code ?? rawCountry ?? null,
    currentTeamCountry: countryEntry ?? null,
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

  const updateUserProfile = useCallback((updater) => {
    let nextUser = null
    setUser((prev) => {
      const base = prev ?? {}
      const draft = typeof updater === 'function' ? updater(base) : { ...base, ...updater }
      nextUser = normalizeUserProfile(draft)
      return nextUser
    })
    if (nextUser) {
      safeSet(storageKeys.user, nextUser)
    }
    return nextUser
  }, [])

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
