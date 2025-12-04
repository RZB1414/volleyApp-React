export interface MatchReportPlayer {
  number: number
  name: string
  stats: Record<string, string>
}

export type MatchReportPlayerInput = MatchReportPlayer

export interface MatchReportTeam {
  team: string
  players: MatchReportPlayer[]
}

export interface MatchReport {
  matchId: string
  generatedAt: string
  matchDate: string | null
  matchTime: string | null
  setColumns: number
  columnLabels: string[]
  teams: MatchReportTeam[]
}
