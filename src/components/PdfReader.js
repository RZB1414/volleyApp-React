import { useState, useRef, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.js?url";
import { ApiError, api } from "../services/api";
import MatchReportTable from "./MatchReportTable.js";

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
    'Points Tot', 'Brake Points', 'Points Won - Lost',
    'Serves Tot', 'Serves Err', 'Serves Pts',
    'Receptions Tot', 'Receptions Err', 'Receptions Pos%', 'Receptions Exc%',
    'Attacks Tot', 'Attacks Err', 'Attacks Blocked', 'Attacks Pts', 'Attacks Pts%', 'BK Pts',
  ];
};

const COLUMN_TOLERANCE = 14;
const HEIGHT_TOLERANCE = 5;
const EMPTY_VALUE_PLACEHOLDER = '.';
const DATE_REGEX = /(?:(?:date|data)\s*[:-]?\s*)?(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i;
const TIME_REGEX = /(?:(?:time|hora|horário|horario)\s*[:-]?\s*)?((?:[01]?\d|2[0-3])[:,h]\d{2}(?:[:,h]\d{2})?\s*(?:am|pm)?)\b/i;
const normalizeTokenText = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/[()]/g, "").trim();
};

const pad = (value) => String(value).padStart(2, '0');

const formatDateForInput = (rawDate) => {
  if (!rawDate) return null;
  const separators = /[./-]/;
  const parts = rawDate.split(separators).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  let [day, month, year] = parts.map((value) => Number(value));

  if (!day || !month || !year) return null;
  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }
  if (month > 12 && day <= 12) {
    [day, month] = [month, day];
  }
  if (day > 31 || month > 12) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
};

const formatTimeForInput = (rawTime) => {
  if (!rawTime) return null;
  const trimmed = rawTime.trim().toLowerCase();
  const meridiemMatch = trimmed.match(/(am|pm)$/);
  const meridiem = meridiemMatch ? meridiemMatch[1] : null;
  const numericPart = trimmed
    .replace(/(am|pm)$/i, '')
    .replace(/h/gi, ':')
    .replace(/\s+/g, '')
    .trim();
  const segments = numericPart.split(':').filter(Boolean);
  if (!segments.length) return null;
  let hours = Number(segments[0]);
  const minutes = Number(segments[1] ?? 0);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  if (meridiem) {
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  }
  hours = hours % 24;
  return `${pad(hours)}:${pad(minutes)}`;
};

const detectMatchMetadata = (lines = []) => {
  if (!Array.isArray(lines) || !lines.length) {
    return { date: null, time: null };
  }

  let detectedDate = null;
  let detectedTime = null;

  for (const line of lines) {
    const text = getLineText(line);
    if (!text) continue;

    if (!detectedDate) {
      const dateMatch = DATE_REGEX.exec(text);
      if (dateMatch) {
        detectedDate = formatDateForInput(dateMatch[1]);
      }
    }

    if (!detectedTime) {
      const timeMatch = TIME_REGEX.exec(text);
      if (timeMatch) {
        detectedTime = formatTimeForInput(timeMatch[1]);
      }
    }

    if (detectedDate && detectedTime) {
      break;
    }
  }

  return { date: detectedDate, time: detectedTime };
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

const formatValidationErrors = (errors) => {
  if (!errors) return "";
  if (typeof errors === "string") return errors;
  if (Array.isArray(errors)) return errors.filter(Boolean).join(", ");
  if (typeof errors === "object") {
    return Object.values(errors)
      .flatMap((value) => {
        if (Array.isArray(value)) return value;
        if (typeof value === "string") return [value];
        if (value && typeof value === "object") return Object.values(value);
        return [];
      })
      .filter(Boolean)
      .join(", ");
  }
  return String(errors);
};

const buildMatchReportPayload = ({
  playersData = [],
  columnLabels = [],
  setColumns = DEFAULT_SET_COLUMNS,
  matchDateValue,
  matchTimeValue,
}) => {
  const grouped = groupPlayersByTeam(playersData);
  const safeLabels = Array.isArray(columnLabels) ? columnLabels : [];
  const normalizedDate = matchDateValue || null;
  const normalizedTime = matchTimeValue || null;

  return {
    generatedAt: new Date().toISOString(),
    setColumns,
    columnLabels: safeLabels,
    matchDate: normalizedDate,
    matchTime: normalizedTime,
    teams: grouped.map(({ team, players }) => ({
      team,
      players: players.map((player) => ({
        number: player.number,
        name: player.name,
        stats: safeLabels.reduce((acc, label, index) => {
          acc[label] = player.columnValues?.[index] ?? EMPTY_VALUE_PLACEHOLDER;
          return acc;
        }, {}),
      })),
    })),
  };
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [matchDate, setMatchDate] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  const autoSubmitInFlight = useRef(false);
  const lastSavedReportRef = useRef(null);

  const resetViewToInitialState = useCallback(() => {
    setPlayers([]);
    setSetColumnCount(DEFAULT_SET_COLUMNS);
    setMatchDate("");
    setMatchTime("");
    setIsUploadVisible(true);
    setLoading(false);
    setError(null);
    setSubmitError(null);
    setSubmitSuccess(null);
  }, []);

  const columnLabels = buildTableColumnLabels(setColumnCount);
  const groupedPlayers = groupPlayersByTeam(players);

  const showToast = (message, tone = "success") => {
    if (!message) return;
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, tone });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  useEffect(() => () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
  }, []);

  const dispatchMatchSavedEvent = (matchId, ownerId) => {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    window.dispatchEvent(new CustomEvent("matchreport:saved", { detail: { matchId, ownerId } }));
  };

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
      setSubmitError(null);
      setSubmitSuccess(null);
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
      const { date: detectedDate, time: detectedTime } = detectMatchMetadata(lines);
      const nextMatchDate = detectedDate || "";
      const nextMatchTime = detectedTime || "";
      setMatchDate(nextMatchDate);
      setMatchTime(nextMatchTime);
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

  async function sendTableDataToBackend(options = {}) {
    const {
      playersInput = players,
      columnLabelsInput = columnLabels,
      setColumnsInput = setColumnCount,
      matchDateInput = matchDate,
      matchTimeInput = matchTime,
      trigger = "manual",
    } = options;

    if (!Array.isArray(playersInput) || !playersInput.length) {
      if (trigger === "manual") {
        setSubmitError("Nenhum dado disponível para envio.");
        setSubmitSuccess(null);
      }
      return null;
    }

    if (trigger === "auto" && autoSubmitInFlight.current) {
      return null;
    }

    if (trigger === "auto") {
      autoSubmitInFlight.current = true;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    const payload = buildMatchReportPayload({
      playersData: playersInput,
      columnLabels: columnLabelsInput,
      setColumns: setColumnsInput,
      matchDateValue: matchDateInput,
      matchTimeValue: matchTimeInput,
    });

    try {
      const response = await api.stats.submitMatchReport(payload);
      const matchId = response?.matchId ?? null;
      const ownerId = response?.ownerId ?? null;
      lastSavedReportRef.current = { matchId, ownerId };
      showToast(matchId ? `Match salvo (#${matchId})` : "Match salvo.");
      dispatchMatchSavedEvent(matchId, ownerId);
      resetViewToInitialState();
      return matchId;
    } catch (submissionError) {
      console.error(submissionError);
      let baseMessage = submissionError?.message || "Falha ao enviar os dados.";
      let combinedMessage = baseMessage;

      if (submissionError instanceof ApiError && submissionError.status === 409) {
        
        baseMessage = 'Já existe um relatório para essa data com os mesmos times.';
        combinedMessage = baseMessage;
      } else {
        const validationDetails = formatValidationErrors(submissionError?.errors);
        combinedMessage = validationDetails ? `${baseMessage} (${validationDetails})` : baseMessage;
      }

      setSubmitError(combinedMessage);
      setSubmitSuccess(null);
      showToast(baseMessage, "error");
      return null;
    } finally {
      setIsSubmitting(false);
      if (trigger === "auto") {
        autoSubmitInFlight.current = false;
      }
    }
  }

  function handleShowUploadInput() {
    setIsUploadVisible(true);
  }

  function handleCloseUploadInput() {
    resetViewToInitialState();
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
          alignItems: "center"
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
            <button
              type="button"
              onClick={handleCloseUploadInput}
              aria-label="Fechar carregamento de PDF"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                borderRadius: "999px",
                border: "1px solid #94a3b8",
                background: "#fee2e2",
                color: "#b91c1c",
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
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {loading && <p>Reading File...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {groupedPlayers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 13, color: "#475569" }}>
              Date
              <input
                type="date"
                value={matchDate}
                onChange={(event) => setMatchDate(event.target.value)}
                style={{
                  marginTop: 4,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #cbd5f5",
                  minWidth: 180,
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 13, color: "#475569" }}>
              Time
              <input
                type="time"
                value={matchTime}
                onChange={(event) => setMatchTime(event.target.value)}
                style={{
                  marginTop: 4,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #cbd5f5",
                  minWidth: 140,
                }}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => sendTableDataToBackend()}
            disabled={isSubmitting}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "none",
              background: isSubmitting ? "#94a3b8" : "#0f172a",
              color: "#f8fafc",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {isSubmitting ? "Uploading..." : "Save Match Report"}
          </button>
          {submitError && <span style={{ color: "#dc2626" }}>{submitError}</span>}
          {submitSuccess && <span style={{ color: "#16a34a" }}>{submitSuccess}</span>}
        </div>
      )}

      {groupedPlayers.length === 0 ? null : (
        <MatchReportTable
          teams={groupedPlayers}
          columnLabels={columnLabels}
          setColumnCount={setColumnCount}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: toast.tone === "error" ? "#dc2626" : "#0f172a",
            color: "#f8fafc",
            padding: "12px 18px",
            borderRadius: 12,
            boxShadow: "0 10px 25px rgba(15, 23, 42, 0.35)",
            fontWeight: 600,
            maxWidth: 320,
          }}
        >
          {toast.message}
        </div>
      )}

    </div>
  );
}

export { buildMatchReportPayload };
