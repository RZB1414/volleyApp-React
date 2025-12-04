const HEADER_BORDER_COLOR = "#1e293b"
const BODY_BORDER_COLOR = "#e2e8f0"
const EMPTY_VALUE_PLACEHOLDER = "."

const buildGroupDividerSet = (groups) => {
  if (!Array.isArray(groups) || !groups.length) return new Set()
  const indices = []
  let cursor = 0

  groups.forEach((group, idx) => {
    if (idx > 0) indices.push(cursor)
    cursor += group.span ?? 0
  })

  return new Set(indices)
}

const resolveColumnValue = (player, columnLabels, index) => {
  if (Array.isArray(player?.columnValues)) {
    return player.columnValues[index] ?? EMPTY_VALUE_PLACEHOLDER
  }
  if (player?.stats && columnLabels[index]) {
    return player.stats[columnLabels[index]] ?? EMPTY_VALUE_PLACEHOLDER
  }
  return EMPTY_VALUE_PLACEHOLDER
}

const MatchReportTable = ({ teams, columnLabels, setColumnCount }) => {
  if (!Array.isArray(teams) || teams.length === 0) return null
  const safeColumnLabels = Array.isArray(columnLabels) ? columnLabels : []
  const safeSetCount = Number.isFinite(setColumnCount) && setColumnCount > 0 ? setColumnCount : safeColumnLabels.length

  return (
    <>
      {teams.map(({ team, players: teamPlayers = [] }) => {
        const upperHeaderCells = [
          { key: "team", label: team, span: 2 },
          { key: "set", label: "Set", span: safeSetCount },
          { key: "vote", label: "Vote", span: 1 },
          { key: "points", label: "Points", span: 3 },
          { key: "serve", label: "Serve", span: 3 },
          { key: "reception", label: "Reception", span: 4 },
          { key: "attack", label: "Attack", span: 5 },
          { key: "bkpts", label: "BK Pts", span: 1 },
        ]
        const dividerSet = buildGroupDividerSet(upperHeaderCells)

        return (
          <section key={team} style={{ marginBottom: 32 }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <h4 style={{ margin: 0 }}>{team}</h4>
              <span style={{ fontSize: 13, color: "#475569" }}>{teamPlayers.length} atletas</span>
            </header>
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                  minWidth: 480,
                }}
              >
                <thead>
                  <tr style={{ background: "#0f172a", color: "#e2e8f0" }}>
                    {upperHeaderCells.map(({ key, label, span }, index) => (
                      <th
                        key={`${team}-${key}`}
                        colSpan={span}
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          borderLeft: index === 0 ? "none" : `1px solid ${HEADER_BORDER_COLOR}`,
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                  <tr style={{ background: "#1e293b", color: "#e2e8f0" }}>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        width: 60,
                        position: "sticky",
                        left: 0,
                        background: "#1e293b",
                        zIndex: 2,
                      }}
                    >
                      Nº
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        borderLeft: dividerSet.has(1) ? `1px solid ${HEADER_BORDER_COLOR}` : "none",
                      }}
                    >
                      Nome
                    </th>
                    {safeColumnLabels.map((label, index) => (
                      <th
                        key={`${team}-header-${index}`}
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          borderLeft: dividerSet.has(index + 2)
                            ? `1px solid ${HEADER_BORDER_COLOR}`
                            : "none",
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamPlayers.map((player, index) => {
                    const fallbackName = player?.name || 'player'
                    const playerKey = `${team}-${player.number}-${fallbackName}-${index}`

                    return (
                      <tr key={playerKey} title={player.lineText}>
                        <td
                          style={{
                            padding: "8px 10px",
                            fontWeight: 600,
                            position: "sticky",
                            left: 0,
                            background: "#1e293b",
                            zIndex: 1,
                          }}
                        >
                          {player.number}
                        </td>
                        <td
                          style={{
                            padding: "8px 10px",
                            borderLeft: dividerSet.has(1) ? `1px solid ${BODY_BORDER_COLOR}` : "none",
                          }}
                        >
                          {player.name}
                        </td>
                        {safeColumnLabels.map((label, index) => (
                          <td
                            key={`${playerKey}-col-${index}`}
                            style={{
                              padding: "8px 10px",
                              borderLeft: dividerSet.has(index + 2)
                                ? `1px solid ${BODY_BORDER_COLOR}`
                                : "none",
                            }}
                          >
                            <div style={{ fontFamily: "monospace", fontSize: 13 }}>
                              {resolveColumnValue(player, safeColumnLabels, index)}
                            </div>
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </>
  )
}

export default MatchReportTable
