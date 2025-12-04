export interface CountryInfo {
  name: string
  code: string
  flag: string | null
}

export interface TeamHistoryEntry {
  teamName: string
  teamCountry: string
  seasonStart: string
  seasonEnd: string
  playerNumber: string
}

export interface UserProfile {
  id: string
  name: string
  email: string
  age: number | null
  country: string | null
  currentTeam: string | null
  currentTeamCountry: CountryInfo | null
  playerNumber: string | null
  yearsAsAProfessional: number | null
  teamHistory: TeamHistoryEntry[]
  createdAt: string | null
  updatedAt: string | null
}
