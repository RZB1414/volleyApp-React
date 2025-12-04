import { sanitizePlayerNumber } from '@/utils/profileUpdate.js'

const UID_PREFIX = 'th'

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${UID_PREFIX}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const toDateInputValue = (value) => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const toIsoDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export const createHistoryDraft = (overrides = {}) => ({
  id: overrides.id || generateId(),
  teamName: overrides.teamName || '',
  teamCountry: overrides.teamCountry || '',
  seasonStart: overrides.seasonStart ? toDateInputValue(overrides.seasonStart) : '',
  seasonEnd: overrides.seasonEnd ? toDateInputValue(overrides.seasonEnd) : '',
  playerNumber: sanitizePlayerNumber(overrides.playerNumber) || '',
})

export const mapApiHistoryToDrafts = (entries = []) => {
  if (!Array.isArray(entries) || !entries.length) {
    return [createHistoryDraft()]
  }
  return entries.map((entry) =>
    createHistoryDraft({
      id: generateId(),
      teamName: entry?.teamName ?? '',
      teamCountry: entry?.teamCountry ?? '',
      seasonStart: entry?.seasonStart,
      seasonEnd: entry?.seasonEnd,
      playerNumber: entry?.playerNumber,
    }),
  )
}

export const buildTeamHistoryPayload = (drafts = []) => {
  const errors = {}
  const entries = []
  const list = Array.isArray(drafts) && drafts.length ? drafts : []

  list.forEach((draft, index) => {
    const basePath = `teamHistory[${index}]`
    const teamName = (draft?.teamName || '').trim()
    const teamCountry = (draft?.teamCountry || '').trim()
    const seasonStartIso = toIsoDate(draft?.seasonStart)
    const seasonEndIso = toIsoDate(draft?.seasonEnd)
    const playerNumber = sanitizePlayerNumber(draft?.playerNumber)

    if (!teamName) {
      errors[`${basePath}.teamName`] = 'Informe o nome do time'
    }
    if (!teamCountry) {
      errors[`${basePath}.teamCountry`] = 'Informe o país do time'
    }
    if (!seasonStartIso) {
      errors[`${basePath}.seasonStart`] = 'Data de início obrigatória'
    }
    if (!seasonEndIso) {
      errors[`${basePath}.seasonEnd`] = 'Data de término obrigatória'
    }
    if (!playerNumber) {
      errors[`${basePath}.playerNumber`] = 'Número de camisa obrigatório'
    }
    if (seasonStartIso && seasonEndIso && new Date(seasonEndIso) < new Date(seasonStartIso)) {
      errors[`${basePath}.seasonEnd`] = 'Fim da temporada deve ser após o início'
    }

    if (!errors[`${basePath}.teamName`] &&
        !errors[`${basePath}.teamCountry`] &&
        !errors[`${basePath}.seasonStart`] &&
        !errors[`${basePath}.seasonEnd`] &&
        !errors[`${basePath}.playerNumber`]) {
      entries.push({
        teamName,
        teamCountry,
        seasonStart: seasonStartIso,
        seasonEnd: seasonEndIso,
        playerNumber,
      })
    }
  })

  return {
    entries,
    errors,
  }
}

export const normalizeTeamHistoryFromApi = (entries = []) => {
  if (!Array.isArray(entries)) return []
  return entries
    .map((entry) => ({
      teamName: (entry?.teamName || '').trim(),
      teamCountry: (entry?.teamCountry || '').trim(),
      seasonStart: toIsoDate(entry?.seasonStart) || null,
      seasonEnd: toIsoDate(entry?.seasonEnd) || null,
      playerNumber: sanitizePlayerNumber(entry?.playerNumber) || null,
    }))
    .filter((entry) => entry.teamName || entry.teamCountry)
}

export const extractTeamHistoryErrors = (errorArray = []) => {
  if (!Array.isArray(errorArray)) return {}
  return errorArray.reduce((acc, item) => {
    if (!item?.field) return acc
    acc[item.field] = item.message || 'Campo inválido'
    return acc
  }, {})
}
