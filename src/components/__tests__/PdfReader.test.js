import { describe, expect, it } from 'vitest'
import { buildMatchReportPayload } from '@/components/PdfReader.js'

const basePlayer = {
  team: 'Volley Stars',
  number: 9,
  name: 'Ana Silva',
  columnValues: ['12', 'A'],
}

const buildPayload = (overrides = {}) =>
  buildMatchReportPayload({
    playersData: [
      { ...basePlayer, ...overrides },
      {
        team: 'Volley Stars',
        number: 10,
        name: 'Beatriz Lima',
        columnValues: ['5', 'B'],
      },
    ],
    columnLabels: ['Tot', 'Vote'],
    setColumns: 2,
    matchDateValue: '2024-06-01',
    matchTimeValue: '18:30',
  })

describe('buildMatchReportPayload', () => {
  it('serializes anonymous player rows with stats only', () => {
    const payload = buildPayload()
    const { players } = payload.teams[0]
    expect(players).toEqual([
      {
        number: 9,
        name: 'Ana Silva',
        stats: { Tot: '12', Vote: 'A' },
      },
      {
        number: 10,
        name: 'Beatriz Lima',
        stats: { Tot: '5', Vote: 'B' },
      },
    ])
  })

  it('fills missing columns with placeholders', () => {
    const payload = buildPayload({ columnValues: ['7'] })
    const { players } = payload.teams[0]
    expect(players[0].stats).toEqual({ Tot: '7', Vote: '.' })
  })
})
