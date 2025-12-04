import { describe, expect, it } from 'vitest'
import { buildProfileUpdatePayload, sanitizePlayerNumber } from '@/utils/profileUpdate.js'

const brazil = { code: 'BR', name: 'Brazil', flag: '/flags/br.svg' }

const baseUser = {
  actualTeam: 'Volley Stars',
  currentTeam: 'Volley Stars',
  currentTeamCountryCode: 'BR',
  currentTeamCountry: brazil,
  playerNumber: '07',
}

describe('sanitizePlayerNumber', () => {
  it('strips non-digits and trims to three characters', () => {
    expect(sanitizePlayerNumber(' 1a2b3c4 ')).toBe('123')
  })
})

describe('buildProfileUpdatePayload', () => {
  it('omits playerNumber when unchanged', () => {
    const { payload, hasChanges } = buildProfileUpdatePayload({
      currentUser: baseUser,
      teamDraft: 'Volley Stars',
      teamCountryDraft: brazil,
      playerNumberDraft: '07',
    })
    expect(hasChanges).toBe(false)
    expect(payload).not.toHaveProperty('playerNumber')
  })

  it('includes playerNumber when updated', () => {
    const { payload, hasChanges } = buildProfileUpdatePayload({
      currentUser: baseUser,
      teamDraft: 'Volley Stars',
      teamCountryDraft: null,
      playerNumberDraft: '12',
    })
    expect(hasChanges).toBe(true)
    expect(payload).toMatchObject({ playerNumber: '12' })
  })

  it('sends an empty string when clearing the jersey number', () => {
    const { payload, hasChanges } = buildProfileUpdatePayload({
      currentUser: baseUser,
      teamDraft: 'Volley Stars',
      teamCountryDraft: null,
      playerNumberDraft: '',
    })
    expect(hasChanges).toBe(true)
    expect(payload).toMatchObject({ playerNumber: '' })
  })

  it('serializes the team country object when it changes', () => {
    const usa = { code: 'US', name: 'United States', flag: '/flags/us.svg' }
    const { payload, hasChanges } = buildProfileUpdatePayload({
      currentUser: baseUser,
      teamDraft: 'Volley Stars',
      teamCountryDraft: usa,
      playerNumberDraft: '07',
    })
    expect(hasChanges).toBe(true)
    expect(payload).toMatchObject({
      country: 'US',
      currentTeamCountryCode: 'US',
      currentTeamCountry: usa,
    })
  })
})
