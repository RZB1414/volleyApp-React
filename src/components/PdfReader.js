import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.js?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const TEAM_HEADER_EXCLUSION_REGEX = /(vote|points|serve|reception|attack|tot|err|pos%|coach|set)/i;
const SECTION_END_REGEX = /^(Points\s+won|Head\s+Coach|Assistant|Set\s+\d+)/i;
const STAT_TOKEN_REGEX = /^([+-]?\d+(?:[.,]\d+)?%?)$/;
const DEFAULT_SET_COLUMNS = 4;
const MAX_SET_COLUMNS = 5;

const buildTableColumnLabels = (setCount = DEFAULT_SET_COLUMNS) => {
  const clampedSets = Math.min(Math.max(1, setCount || DEFAULT_SET_COLUMNS), MAX_SET_COLUMNS);
  const setColumns = Array.from({ length: clampedSets }, (_, index) => `${index + 1}`);

  return [
    ...setColumns,
    'Vote',
    'Tot', 'BP', 'W-L',
    'Tot', 'Err', 'Pts',
    'Tot', 'Err', 'Pos%', 'Exc%',
    'Tot', 'Err', 'Blo', 'Pts', 'Pts%', 'BK Pts',
  ];
};

const HEADER_BORDER_COLOR = "#1e293b";
const BODY_BORDER_COLOR = "#e2e8f0";

const COLUMN_TOLERANCE = 14;
const HEIGHT_TOLERANCE = 5;
const EMPTY_VALUE_PLACEHOLDER = '.';
const normalizeTokenText = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/[()]/g, "").trim();
};

const buildGroupDividerSet = (groups) => {
  if (!Array.isArray(groups) || !groups.length) return new Set();
  const indices = [];
  let cursor = 0;

  groups.forEach((group, idx) => {
    if (idx > 0) indices.push(cursor);
    cursor += group.span ?? 0;
  });

  return new Set(indices);
};

const mapTokensToColumns = (tokens, columnAnchors, columnLabels) => {
  const labels = Array.isArray(columnLabels) && columnLabels.length
    ? columnLabels
    : buildTableColumnLabels();
  const safeTokens = Array.isArray(tokens) ? tokens : [];

  if (!Array.isArray(columnAnchors) || columnAnchors.length !== labels.length) {
    return labels.map((_, index) => {
      const token = safeTokens[index];
      const value = normalizeTokenText(token?.text);
      return value && value.length ? value : EMPTY_VALUE_PLACEHOLDER;
    });
  }

  const result = labels.map(() => EMPTY_VALUE_PLACEHOLDER);
  const occupied = new Array(columnAnchors.length).fill(false);

  safeTokens.forEach((token) => {
    const value = normalizeTokenText(token.text);
    if (!value) return;

    const width = token.width ?? 0;
    const height = token.height ?? 0;
    const start = token.x;
    const end = start + width;
    const center = start + width / 2;

    let bestIndex = -1;
    let bestScore = Infinity;

    columnAnchors.forEach((anchor, index) => {
      if (occupied[index]) return;
      const overlapsHorizontally =
        (start >= anchor.start - COLUMN_TOLERANCE && start <= anchor.end + COLUMN_TOLERANCE) ||
        (end >= anchor.start - COLUMN_TOLERANCE && end <= anchor.end + COLUMN_TOLERANCE) ||
        (start <= anchor.start && end >= anchor.end);

      const heightDiff = anchor.height ? Math.abs(anchor.height - height) : 0;
      const heightPenalty = heightDiff > HEIGHT_TOLERANCE ? heightDiff : 0;
      const score = Math.abs(anchor.center - center) + heightPenalty + (overlapsHorizontally ? 0 : 25);

      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex !== -1) {
      occupied[bestIndex] = true;
      result[bestIndex] = value;
    }
  });

  return result;
};

const groupPlayersByTeam = (players = []) => {
  if (!Array.isArray(players) || !players.length) return [];

  const teams = players.reduce((acc, player) => {
    const teamName = player.team || "Equipe";
    if (!acc[teamName]) acc[teamName] = [];
    acc[teamName].push(player);
    return acc;
  }, {});

  return Object.entries(teams).map(([team, teamPlayers]) => ({
    team,
    players: [...teamPlayers].sort((a, b) => a.number - b.number),
  }));
};

function round(value) {
  return Number((value ?? 0).toFixed(2));
}

function groupLines(items, tolerance = 2.5) {
  const rows = [];
  const yBuckets = [];

  items.forEach((it) => {
    let bucketIndex = -1;

    for (let i = 0; i < yBuckets.length; i += 1) {
      if (Math.abs(yBuckets[i] - it.y) <= tolerance) {
        bucketIndex = i;
        break;
      }
    }

    if (bucketIndex === -1) {
      yBuckets.push(it.y);
      rows.push([it]);
    } else {
      rows[bucketIndex].push(it);
    }
  });

  const lineObjects = rows.map((row) => {
    const sorted = row.sort((a, b) => a.x - b.x);
    return {
      y: sorted.reduce((sum, item) => sum + item.y, 0) / sorted.length,
      page: sorted[0].page,
      tokens: sorted.map((token) => ({
        str: token.str,
        x: token.x,
        width: token.width,
        height: token.height,
      })),
    };
  });

  return lineObjects.sort((a, b) => a.page - b.page || b.y - a.y);
}

function getLineText(line) {
  return line.tokens
    .map((token) => token.str.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function detectTeamHeader(text) {
  if (!text) return null;
  const normalized = text.replace(/\s{2,}/g, " ").trim();
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  const keywordMatch = TEAM_HEADER_EXCLUSION_REGEX.exec(lower);
  const trimmedBeforeKeywords = keywordMatch
    ? normalized.slice(0, keywordMatch.index).trim()
    : normalized;

  if (!trimmedBeforeKeywords) return null;

  const withoutScores = trimmedBeforeKeywords
    .replace(/\s*\d+\s*-\s*\d+\s*$/, "")
    .replace(/\d+$/, "")
    .trim();

  if (!withoutScores) return null;

  const cleanText = withoutScores
    .replace(/\d+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const isValidChunk = (chunk) => /^[A-ZÀ-Ú0-9][A-Za-zÀ-ú0-9' ]*$/.test(chunk);

  if (cleanText.includes("-")) {
    const parts = cleanText
      .split("-")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter(isValidChunk);

    if (parts.length >= 1) {
      return parts.join(" - ");
    }
    return null;
  }

  if (isValidChunk(cleanText)) {
    return cleanText;
  }

  return null;
}

function isSectionTerminator(text) {
  return SECTION_END_REGEX.test(text);
}

function isStatValue(value) {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  return normalized === "." || normalized === "-" || STAT_TOKEN_REGEX.test(normalized);
}

function splitTokenText(token) {
  const original = token.str ?? token.text ?? "";
  if (!original.includes(" ")) return [{ ...token, str: original }];

  const parts = original.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [{ ...token, str: original }];

  const widthPerChar = (token.width ?? 0) / (original.length || 1);
  let cursorX = token.x;

  return parts.map((part) => {
    const estimatedWidth = widthPerChar * part.length || token.width;
    const piece = {
      ...token,
      str: part,
      x: cursorX,
      width: estimatedWidth,
    };
    cursorX += estimatedWidth + widthPerChar;
    return piece;
  });
}

function parsePlayerLine(line) {
  const tokens = line.tokens
    .flatMap((token) => splitTokenText(token))
    .map((token) => ({
      text: token.str.trim(),
      x: token.x,
      width: token.width ?? 0,
      height: token.height ?? 0,
    }))
    .filter((token) => Boolean(token.text));

  if (!tokens.length) return null;

  let numberIndex = -1;
  let numberText = null;

  for (let i = 0; i < Math.min(3, tokens.length); i += 1) {
    const raw = tokens[i].text.replace(/\s+/g, "");
    const digits = raw.replace(/[^0-9]/g, "");
    const remainder = raw.replace(/[0-9]/g, "").replace(/[^A-Za-z]/g, "");

    if (!digits || digits.length > 3) continue;
    if (remainder && !/^L+$/i.test(remainder)) continue;

    numberIndex = i;
    numberText = digits;
    break;
  }

  if (numberIndex === -1) return null;
  const number = Number(numberText);
  let remainingTokens = tokens.slice(numberIndex + 1);

  while (remainingTokens.length && /^L+$/i.test(remainingTokens[0].text.replace(/[^A-Za-z]/g, ""))) {
    remainingTokens = remainingTokens.slice(1);
  }

  const nameParts = [];
  const statTokens = [];
  let collectingStats = false;

  remainingTokens.forEach((token) => {
    if (!collectingStats && !isStatValue(token.text)) {
      const normalized = token.text.replace(/[^A-Za-zÀ-ÿ'\-\s]/g, "");
      if (!normalized) return;
      nameParts.push(token.text);
      return;
    }
    collectingStats = true;
    statTokens.push(token);
  });

  const name = nameParts.join(" ").trim();
  if (!name) return null;

  return {
    number,
    name,
    rawStats: statTokens.map((token) => token.text),
    lineText: getLineText(line),
    statTokens,
  };
}

function inferColumnAnchors(players, lines, currentSetCount = DEFAULT_SET_COLUMNS) {
  const headerResult = inferAnchorsFromHeader(lines);
  if (headerResult) return headerResult;

  const columnLabels = buildTableColumnLabels(currentSetCount);

  if (!Array.isArray(players) || !players.length) {
    return { anchors: null, detectedSetCount: currentSetCount };
  }

  const candidateTokens = players
    .map((player) => player.statTokens?.filter((token) => token?.text?.trim()) || [])
    .filter((tokens) => tokens.length >= columnLabels.length)
    .sort((a, b) => b.length - a.length)[0];

  if (!candidateTokens) {
    return { anchors: null, detectedSetCount: currentSetCount };
  }

  const anchors = columnLabels.map((_, index) => {
    const token = candidateTokens[index];
    const width = token.width ?? 0;
    return {
      start: token.x,
      end: token.x + width,
      center: token.x + width / 2,
      height: token.height ?? 0,
    };
  });

  return { anchors, detectedSetCount: currentSetCount };
}

function inferAnchorsFromHeader(lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  const headerLine = lines.find((line) => {
    const text = getLineText(line).toLowerCase();
    return text.includes("pos%") && text.includes("vote") && text.includes("blo");
  });

  if (!headerLine) return null;

  const flattenedTokens = headerLine.tokens
    .flatMap((token) => splitTokenText(token))
    .map((token) => ({
      text: token.str.trim(),
      x: token.x,
      width: token.width ?? 0,
      height: token.height ?? 0,
    }))
    .filter((token) => Boolean(token.text));

  const firstDataIndex = flattenedTokens.findIndex((token) => token.text === "1");
  if (firstDataIndex === -1) return null;

  const dataTokens = flattenedTokens.slice(firstDataIndex);
  if (!dataTokens.length) return null;

  const firstVoteIndex = dataTokens.findIndex((token) => token.text.toLowerCase() === "vote");
  const setCount = firstVoteIndex > 0 ? firstVoteIndex : DEFAULT_SET_COLUMNS;
  const columnLabels = buildTableColumnLabels(setCount);

  if (dataTokens.length < columnLabels.length) return null;

  const anchors = columnLabels.map((_, index) => {
    const token = dataTokens[index];
    const width = token.width ?? 0;
    return {
      start: token.x,
      end: token.x + width,
      center: token.x + width / 2,
      height: token.height ?? 0,
    };
  });

  return { anchors, detectedSetCount: setCount };
}

function extractPlayers(lines) {
  const playersFound = [];
  let currentTeam = null;
  let lastPlayerLineIndex = -1;
  let playersTotalCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const text = getLineText(line);
    if (!text) continue;

    const normalizedText = text.toLowerCase();

    if (normalizedText.includes("players total")) {
      playersTotalCount += 1;
      if (playersTotalCount >= 2) {
        const cutoffIndex = lastPlayerLineIndex >= 0 ? lastPlayerLineIndex : index - 1;
        return { players: playersFound, lastPlayerLineIndex: cutoffIndex };
      }
      currentTeam = null;
      continue;
    }

    const teamHeader = detectTeamHeader(text);
    if (teamHeader) {
      currentTeam = teamHeader;
      continue;
    }

    if (isSectionTerminator(text)) {
      currentTeam = null;
      continue;
    }

    if (!currentTeam) continue;

    const possiblePlayer = parsePlayerLine(line);
    if (!possiblePlayer) continue;

    playersFound.push({ ...possiblePlayer, team: currentTeam });
    lastPlayerLineIndex = index;
  }

  return { players: playersFound, lastPlayerLineIndex };
}

function logPlayersToConsole(fileName, playersList) {
  console.groupCollapsed(`[PDF] ${fileName} :: players found (${playersList.length})`);
  if (!playersList.length) {
    console.warn("No player identified.");
    console.groupEnd();
    return;
  }

  const grouped = playersList.reduce((acc, player) => {
    if (!acc[player.team]) acc[player.team] = [];
    acc[player.team].push(player);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([team, players]) => {
    console.groupCollapsed(`${team} (${players.length})`);
    players.forEach((player) => {
      console.log(`#${player.number} ${player.name}`, player.rawStats);
      console.debug("Linha bruta:", player.lineText);
    });
    console.groupEnd();
  });

  console.groupEnd();
}

function logTokensBeforeFiltering(lines) {
  console.groupCollapsed(`[PDF] Tokens brutos :: ${lines.length} linhas`);
  lines.forEach((line, lineIndex) => {
    console.groupCollapsed(
      `Linha ${lineIndex + 1} :: página ${line.page} :: y=${line.y}`,
    );
    line.tokens.forEach((token, tokenIndex) => {
      console.log(`#${tokenIndex}`, {
        text: token.str,
        x: token.x,
        width: token.width,
        height: token.height,
        lineY: line.y,
      });
    });
    console.groupEnd();
  });
  console.groupEnd();
}

export default function VolleyPdfParser() {
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [setColumnCount, setSetColumnCount] = useState(DEFAULT_SET_COLUMNS);
  const [isUploadVisible, setIsUploadVisible] = useState(true);

  const columnLabels = buildTableColumnLabels(setColumnCount);
  const groupedPlayers = groupPlayersByTeam(players);

  // -------------------------------
  // HANDLE FILE UPLOAD
  // -------------------------------
  async function onFileChange(e) {
    const file = e.target.files[0];
    const success = await parsePDF(file);
    if (success) {
      setIsUploadVisible(false);
    }
  }

  // -------------------------------
  // PARSE PDF
  // -------------------------------
  async function parsePDF(pdfFile) {
    try {
      setLoading(true);
      setError(null);
      setPlayers([]);

      const buffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

      const items = [];

      // Extract all text + position from all pages
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();

        for (const it of content.items) {
          const width = typeof it.width === "number" ? it.width : Math.abs(it.transform[0]);
          const height = typeof it.height === "number" ? it.height : Math.abs(it.transform[3]);
          items.push({
            str: it.str,
            x: round(it.transform[4]),
            y: round(it.transform[5]),
            width: round(width),
            height: round(height),
            page: pageNum,
          });
        }
      }

      const lines = groupLines(items);
      const { players: parsedPlayers, lastPlayerLineIndex } = extractPlayers(lines);
      const relevantLines =
        typeof lastPlayerLineIndex === "number" && lastPlayerLineIndex >= 0
          ? lines.slice(0, lastPlayerLineIndex + 1)
          : lines;

      logTokensBeforeFiltering(relevantLines);

      const { anchors: columnAnchors, detectedSetCount } = inferColumnAnchors(
        parsedPlayers,
        relevantLines,
        setColumnCount,
      );
      const effectiveSetCount = detectedSetCount || DEFAULT_SET_COLUMNS;
      const effectiveColumnLabels = buildTableColumnLabels(effectiveSetCount);
      setSetColumnCount(effectiveSetCount);

      const normalizedPlayers = parsedPlayers.map((player) => ({
        ...player,
        columnValues: mapTokensToColumns(player.statTokens, columnAnchors, effectiveColumnLabels),
      }));

      if (!normalizedPlayers.length) {
        setError("No player could be found on this PDF.");
      } else {
        setError(null);
      }

      logPlayersToConsole(pdfFile.name, normalizedPlayers);
      setPlayers(normalizedPlayers);

      setLoading(false);
      return true;
    } catch (err) {
      console.error(err);
      setError("Upload failed.");
      setLoading(false);
      return false;
    }
  }

  function handleShowUploadInput() {
    setIsUploadVisible(true);
  }

  // -------------------------------
  // UI
  // -------------------------------
  return (
    <div style={{ padding: 16, maxWidth: 900 }}>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        {isUploadVisible ? (
          <>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 16px",
                height: 38,
                borderRadius: 999,
                border: "1px dashed #94a3b8",
                background: "#ffffff",
                color: "#0f172a",
                fontWeight: 600,
                cursor: "pointer",
                position: "relative",
              }}
            >
              Upload Match Report
              <input
                type="file"
                accept="application/pdf"
                onChange={onFileChange}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: 0,
                  cursor: "pointer",
                }}
              />
            </label>
          </>
        ) : (
          <button
            type="button"
            onClick={handleShowUploadInput}
            aria-label="Adicionar novo PDF"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: "999px",
              border: "1px solid #94a3b8",
              background: "#f8fafc",
              color: "#0f172a",
              cursor: "pointer",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {loading && <p>Reading File...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {groupedPlayers.length === 0 ? (
        <p style={{ color: "#475569" }}></p>
      ) : (
        groupedPlayers.map(({ team, players: teamPlayers }) => {
          const upperHeaderCells = [
            { key: "team", label: team, span: 2 },
            { key: "set", label: "Set", span: setColumnCount },
            { key: "vote", label: "Vote", span: 1 },
            { key: "points", label: "Points", span: 3 },
            { key: "serve", label: "Serve", span: 3 },
            { key: "reception", label: "Reception", span: 4 },
            { key: "attack", label: "Attack", span: 5 },
            { key: "bkpts", label: "BK Pts", span: 1 },
          ];
          const dividerSet = buildGroupDividerSet(upperHeaderCells);

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
                      {columnLabels.map((label, index) => (
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
                  {teamPlayers.map((player) => (
                    <tr
                      key={`${team}-${player.number}-${player.name}`}
                      title={player.lineText}
                    >
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
                      {player.columnValues.map((value, index) => (
                        <td
                          key={`${player.number}-${index}`}
                          style={{
                            padding: "8px 10px",
                            borderLeft: dividerSet.has(index + 2)
                              ? `1px solid ${BODY_BORDER_COLOR}`
                              : "none",
                          }}
                        >
                          <div style={{ fontFamily: "monospace", fontSize: 13 }}>
                            {value}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
        })
      )}

    </div>
  );
}
