const STORAGE_KEY = 'volleyplus_completed_uploads'
const UPDATE_EVENT = 'volleyplus:completed-uploads-updated'
const FALLBACK_USER = 'anonymous'
const MAX_ENTRIES_PER_USER = 25

const readAll = () => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const writeAll = (data) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.warn('Failed to persist completed uploads', error)
  }
}

const emitUpdate = (userId) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(UPDATE_EVENT, {
      detail: { userId: userId ?? FALLBACK_USER },
    }),
  )
}

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const listCompletedUploads = (userId) => {
  const ownerKey = userId || FALLBACK_USER
  const all = readAll()
  return all[ownerKey] ?? []
}

export const recordCompletedUpload = (userId, payload) => {
  if (!payload?.fileKey) return null
  const ownerKey = userId || FALLBACK_USER
  const all = readAll()
  const existing = all[ownerKey] ?? []
  const entry = {
    id: generateId(),
    uploadedAt: new Date().toISOString(),
    ...payload,
  }
  const next = [entry, ...existing].slice(0, MAX_ENTRIES_PER_USER)
  all[ownerKey] = next
  writeAll(all)
  emitUpdate(ownerKey)
  return entry
}

export const COMPLETED_UPLOADS_STORAGE_KEY = STORAGE_KEY
export const COMPLETED_UPLOADS_EVENT = UPDATE_EVENT
