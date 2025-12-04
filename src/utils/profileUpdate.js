export const sanitizePlayerNumber = (value) => {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[^0-9]/g, '').slice(0, 3)
}

export const serializeTeamCountry = (country) => {
  if (!country) return ''
  if (typeof country === 'string') return country.trim()
  if (typeof country.name === 'string' && country.name.trim()) return country.name.trim()
  if (typeof country.code === 'string' && country.code.trim()) return country.code.trim()
  return ''
}

export const buildProfileUpdatePayload = ({ currentUser, teamDraft, teamCountryDraft, playerNumberDraft }) => {
  const nextTeam = (teamDraft || '').trim()
  const currentTeamName = (currentUser?.currentTeam || '').trim()
  const payload = {}

  const currentCountry = serializeTeamCountry(currentUser?.currentTeamCountry)
  const draftCountry = serializeTeamCountry(teamCountryDraft)

  if (nextTeam !== currentTeamName) {
    payload.currentTeam = nextTeam || ''
  }

  if (draftCountry !== currentCountry) {
    payload.country = draftCountry || ''
    payload.currentTeamCountry = draftCountry || ''
  }

  const sanitizedDraftNumber = sanitizePlayerNumber(playerNumberDraft)
  const currentPlayerNumber = sanitizePlayerNumber(currentUser?.playerNumber)
  if (sanitizedDraftNumber !== currentPlayerNumber) {
    payload.playerNumber = sanitizedDraftNumber || ''
  }

  return {
    payload,
    hasChanges: Object.keys(payload).length > 0,
  }
}
