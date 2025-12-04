const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

class ApiError extends Error {
  constructor(message, status, errors = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

let authSnapshot = () => ({ token: null, user: null, headerOverrides: {} })

export const configureAuthObserver = (getSnapshot) => {
  authSnapshot = getSnapshot
}

const normalizeTeamName = (value) => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

const normalizePlayerNumber = (value) => {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized || null
}

const resolveUserPlayerFilters = ({ team, playerNumber } = {}) => {
  const { user } = authSnapshot()
  const derivedTeam = normalizeTeamName(team ?? user?.actualTeam ?? user?.currentTeam)
  const derivedNumber = normalizePlayerNumber(playerNumber ?? user?.playerNumber)
  return { team: derivedTeam, playerNumber: derivedNumber }
}

const resolveUserHeaders = (requireUserHeaders) => {
  const { user, headerOverrides } = authSnapshot()
  const derivedId = headerOverrides?.userId ?? user?.id ?? user?._id ?? user?.userId ?? null
  const derivedEmail = headerOverrides?.email ?? user?.email ?? null

  if (!requireUserHeaders && !derivedId) {
    return {}
  }

  return {
    ...(derivedId ? { 'x-user-id': derivedId } : {}),
    ...(derivedEmail ? { 'x-user-email': derivedEmail } : {}),
  }
}

const buildUrl = (path) => {
  if (!API_BASE_URL) {
    throw new Error('Missing VITE_API_BASE_URL. Set it in your .env file before making API calls.')
  }
  if (path.startsWith('http')) return path
  return `${API_BASE_URL}${path}`
}

const parseErrorPayload = async (response) => {
  try {
    return await response.json()
  } catch {
    return { message: response.statusText }
  }
}

export const request = async (path, options = {}) => {
  const {
    method = 'GET',
    body,
    headers = {},
    auth = true,
    requireUserHeaders,
    signal,
    skipJsonEncoding = false,
  } = options

  const finalHeaders = new Headers(headers)
  const shouldSendJson = body && !(body instanceof FormData) && !skipJsonEncoding

  if (shouldSendJson && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json')
  }

  if (auth) {
    const { token } = authSnapshot()
    if (token) {
      finalHeaders.set('Authorization', `Bearer ${token}`)
    }
  }

  const needsUserHeaders = typeof requireUserHeaders === 'boolean' ? requireUserHeaders : path.startsWith('/upload/')
  const userHeaders = resolveUserHeaders(needsUserHeaders)
  Object.entries(userHeaders).forEach(([key, value]) => {
    if (value && !finalHeaders.has(key)) {
      finalHeaders.set(key, value)
    }
  })

  const response = await fetch(buildUrl(path), {
    method,
    body: shouldSendJson ? JSON.stringify(body) : body,
    headers: finalHeaders,
    credentials: 'include',
    signal,
  })

  if (!response.ok) {
    const errorPayload = await parseErrorPayload(response)
    throw new ApiError(errorPayload.message || 'Request failed', response.status, errorPayload.errors || errorPayload)
  }

  if (response.status === 204) return null

  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    return response.json()
  }
  return response.text()
}

export const api = {
  auth: {
    register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
    login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
    me: () => request('/auth/me'),
    updateProfile: (payload = {}) => {
      const sanitizedEntries = Object.entries(payload).filter(([, value]) => value !== undefined)
      return request('/auth/me', {
        method: 'PATCH',
        body: Object.fromEntries(sanitizedEntries),
      })
    },
  },
  health: {
    status: () => request('/health', { auth: false }),
  },
  upload: {
    createSession: ({ fileName, contentType, fileSizeBytes, partCount }) =>
      request('/upload/multipart', {
        method: 'POST',
        body: { fileName, contentType, fileSizeBytes, parts: partCount },
      }),
    complete: ({ fileKey, fileName, uploadId, parts }) => {
      const body = { uploadId, parts }
      if (fileKey) body.fileKey = fileKey
      if (fileName) body.fileName = fileName
      return request('/upload/multipart/complete', {
        method: 'POST',
        body,
      })
    },
    cancel: ({ fileKey, fileName, uploadId }) => {
      const body = { uploadId }
      if (fileKey) body.fileKey = fileKey
      if (fileName) body.fileName = fileName
      return request('/upload/multipart/cancel', {
        method: 'POST',
        body,
      })
    },
    pending: ({ limit = 10 } = {}) =>
      request(`/upload/multipart/pending?limit=${limit}`),
    completed: ({ userId, limit = 100 } = {}) => {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (userId) params.set('userId', userId)
      const query = params.toString()
      const path = query ? `/upload/multipart/completed?${query}` : '/upload/multipart/completed'
      return request(path, {
        requireUserHeaders: true,
      })
    },
  },
  download: {
    generateToken: ({ fileName, uploadedAt }) => {
      const body = { fileName }
      if (uploadedAt) {
        body.uploadedAt = uploadedAt
      }
      return request('/download/generate', {
        method: 'POST',
        body,
      })
    },
  },
  stats: {
    submitMatchReport: (payload) =>
      request('/stats/match-report', {
        method: 'POST',
        body: payload,
      }),
    listMatchReports: ({ limit = 20, team, playerNumber } = {}) => {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      const filterParams = resolveUserPlayerFilters({ team, playerNumber })
      if (filterParams.team) params.set('team', filterParams.team)
      if (filterParams.playerNumber) params.set('playerNumber', filterParams.playerNumber)
      const query = params.toString()
      const path = query ? `/stats/match-report?${query}` : '/stats/match-report'
      return request(path)
    },
    getMatchReport: (matchId) => {
      if (!matchId) {
        throw new Error('matchId is required')
      }
      return request(`/stats/match-report/${encodeURIComponent(matchId)}`)
    },
  },
}

export { ApiError }
