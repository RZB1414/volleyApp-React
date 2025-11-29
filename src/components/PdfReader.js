import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.js?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// ----------------- CONFIG -----------------
const MAX_SETS = 5;
const MIN_SETS = 3;
const EMPTY = ".";
const COL_TOLERANCE_PX = 14; // tolerância de agrupamento horizontal
const Y_TOLERANCE = 2.5;

// A ordem que esperamos após os sets:
// [Points.Tot, Points.BP, Points.WL, Serve.Tot, Serve.Err, Serve.Pts,
// Reception.Tot, Reception.Err, Reception.Pos%, Reception.Exc%,
// Attack.Tot, Attack.Err, Attack.Blo, Attack.Pts, Attack.Pts%, BK.Pts]
const POST_SET_FIELDS = [
  "points_tot", "points_bp", "points_wl",
  "serve_tot", "serve_err", "serve_pts",
  "reception_tot", "reception_err", "reception_pos", "reception_exc",
  "attack_tot", "attack_err", "attack_blo", "attack_pts", "attack_pts_percent",
  "bk_pts"
];

// ----------------- UTIL -----------------
const round2 = (v) => Number((v ?? 0).toFixed(2));
const isIntegerLike = (s) => typeof s === "string" && /^\d+$/.test(s);
const looksLikeSetVal = (s) => {
  if (!s) return false;
  const t = String(s).trim();
  if (t === "." || t === "-" || t === "—") return false; // treat as missing, not a set value
  // a set value is normally integer or decimal (ex: 3, 4, 6.3)
  return /^[+-]?\d+(\.\d+)?$/.test(t);
};
const looksLikeStat = (s) => {
  if (!s) return false;
  const t = String(s).trim();
  if (t === "." || t === "-" || t === "—") return true;
  if (/^[+-]?\d+(\.\d+)?$/.test(t)) return true; // numbers
  if (/^\(?\d+(\.\d+)?%?\)?$/.test(t)) return true; // percentages maybe in parentheses
  if (/^[+-]?\d+$/.test(t)) return true;
  return false;
};
const toNumberOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "." || s === "-" || s === "") return null;
  if (/^\(?\d+(\.\d+)?%?\)?$/.test(s)) {
    // keep percentages as strings without parens
    if (s.includes("%")) return s.replace(/[()]/g, "");
  }
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s.replace(",", "."));
  return s;
};

// ----------------- PDF TEXT -> LINES (x,y) -----------------
function groupLines(items, yTol = Y_TOLERANCE) {
  const yBuckets = [];
  const rows = [];

  for (const it of items) {
    let idx = -1;
    for (let i = 0; i < yBuckets.length; i++) {
      if (Math.abs(yBuckets[i] - it.y) <= yTol) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      yBuckets.push(it.y);
      rows.push([it]);
    } else rows[idx].push(it);
  }

  const lineObjs = rows.map((row) => {
    const sorted = row.sort((a, b) => a.x - b.x);
    return {
      y: sorted.reduce((s, t) => s + t.y, 0) / sorted.length,
      page: sorted[0].page,
      tokens: sorted.map((t) => ({
        text: String(t.str).trim(),
        x: t.x,
        width: t.width ?? 0,
        height: t.height ?? 0
      }))
    };
  });

  // order top->bottom (y decreasing in PDF coord; ensure visually top->bottom)
  return lineObjs.sort((A, B) => A.page - B.page || B.y - A.y);
}

// ----------------- DETECT TEAM HEADER -----------------
function detectTeamName(lineText) {
  // match common patterns like "AL AIN - Al Ain" or "SHABAB AHLI DUBAI"
  const m = lineText.match(/^[A-Z][A-Z0-9\s.'-]{2,40}(?:\s*-\s*[A-Z][A-Z0-9\s.'-]{2,40})?/i);
  if (!m) return null;
  // Filter common words that are not team headers
  const text = m[0].trim();
  // Basic heuristics: if contains "AL" and length < 40, accept
  if (/AL\s+/i.test(text) || /DUBAI|SHABAB|AHLI|AIN/i.test(text)) return text;
  return null;
}

// ----------------- PARSE PLAYER LINE (number / name / stat tokens) -----------------
function parsePlayerLine(line) {
  const toks = line.tokens.filter(t => t.text && t.text.length);
  if (!toks.length) return null;
  // first token must be player number
  const first = toks[0].text;
  if (!/^\d{1,3}$/.test(first)) return null;
  const number = Number(first);

  // find index where stat tokens start: first token that looks like a stat (not name)
  let statStart = -1;
  for (let i = 1; i < toks.length; i++) {
    if (looksLikeStat(toks[i].text)) {
      statStart = i;
      break;
    }
  }
  if (statStart === -1) statStart = toks.length;

  const nameParts = toks.slice(1, statStart).map(t => t.text);
  let name = nameParts.join(" ").replace(/\s{2,}/g, " ").trim();
  // cleanup stray symbols
  name = name.replace(/[①②③④⑤⑥⑦⑧⑨]/g, "").replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9' .-]/g, "").trim();

  const statTokens = toks.slice(statStart).map(t => ({ text: t.text, x: t.x, width: t.width }));

  return {
    number,
    name,
    statTokens,
    rawStats: statTokens.map(t => t.text),
    lineText: toks.map(t => t.text).join(" ")
  };
}

// ----------------- DETECT SET COUNT (OPÇÃO A: MAIOR CONSECUTIVO) -----------------
function detectSetCountFromPlayers(players) {
  let max = MIN_SETS;
  for (const p of players) {
    let cnt = 0;
    for (const tok of p.rawStats) {
      if (looksLikeSetVal(tok)) cnt++;
      else break;
    }
    if (cnt > max) max = cnt;
  }
  return Math.min(MAX_SETS, Math.max(MIN_SETS, max));
}

// ----------------- INFER COLUMN ANCHORS (cluster por x) -----------------
function inferColumnAnchors(players, setCount) {
  // want anchors for: setCount + POST_SET_FIELDS.length columns
  const needed = setCount + POST_SET_FIELDS.length;
  const allTokens = players.flatMap(p => p.statTokens || []);
  if (!allTokens.length) return null;

  // build array of x centers
  const centers = allTokens.map(t => ({ center: t.x + (t.width ?? 0) / 2, w: t.width ?? 0 }));

  // sort centers
  centers.sort((a, b) => a.center - b.center);

  // cluster by proximity
  const clusters = [];
  let bucket = [centers[0]];
  for (let i = 1; i < centers.length; i++) {
    const prev = centers[i - 1];
    const cur = centers[i];
    if (Math.abs(cur.center - prev.center) <= COL_TOLERANCE_PX) {
      bucket.push(cur);
    } else {
      clusters.push(bucket);
      bucket = [cur];
    }
  }
  clusters.push(bucket);

  // if clusters < needed, try merging small gaps by increasing tolerance a bit
  let tolIncrement = 0;
  while (clusters.length > needed && tolIncrement <= 20) {
    // remove smallest cluster (least members) until matches needed
    clusters.sort((a, b) => b.length - a.length);
    clusters.pop();
    tolIncrement++;
  }
  while (clusters.length < needed && tolIncrement <= 40) {
    // merge nearest clusters
    if (clusters.length <= 1) break;
    let minDist = Infinity;
    let idx = -1;
    for (let i = 0; i < clusters.length - 1; i++) {
      const a = average(clusters[i].map(c => c.center));
      const b = average(clusters[i + 1].map(c => c.center));
      const d = Math.abs(b - a);
      if (d < minDist) { minDist = d; idx = i; }
    }
    if (idx >= 0) {
      clusters[idx] = clusters[idx].concat(clusters[idx + 1]);
      clusters.splice(idx + 1, 1);
    } else break;
    tolIncrement++;
  }

  // sort clusters left->right
  clusters.sort((a, b) => average(a.map(x => x.center)) - average(b.map(x => x.center)));

  // trim/pad to needed
  if (clusters.length > needed) clusters.splice(needed);
  while (clusters.length < needed) {
    // pad with evenly spaced anchors to the right (rare)
    const last = clusters[clusters.length - 1] || [{ center: 100 }];
    clusters.push([{ center: last[0].center + 30 }]);
  }

  // return anchor centers
  return clusters.map(c => ({ center: average(c.map(x => x.center)) }));
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ----------------- MAP STAT TOKENS INTO COLUMNS USING ANCHORS -----------------
function mapStatTokensToColumns(statTokens, anchors, setCount) {
  const cols = Array(setCount + POST_SET_FIELDS.length).fill(EMPTY);
  if (!anchors || !anchors.length || !statTokens || !statTokens.length) return cols;

  for (const tk of statTokens) {
    const center = tk.x + (tk.width ?? 0) / 2;
    // find closest anchor
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < anchors.length; i++) {
      const d = Math.abs(center - anchors[i].center);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    cols[best] = tk.text;
  }
  return cols;
}

// ----------------- MAP COLUMNS TO FINAL MODEL -----------------
function columnsToModel(cols, setCount) {
  // cols: array length setCount + POST_SET_FIELDS.length
  const sets = cols.slice(0, setCount).map(c => toNumberOrNull(c) ?? null);
  const after = cols.slice(setCount);

  const model = {
    sets,
    points: {
      tot: toNumberOrNull(after[0]),
      bp: toNumberOrNull(after[1]),
      wl: after[2] && after[2] !== EMPTY ? after[2] : null
    },
    serve: {
      tot: toNumberOrNull(after[3]),
      err: toNumberOrNull(after[4]),
      pts: toNumberOrNull(after[5])
    },
    reception: {
      tot: toNumberOrNull(after[6]),
      err: toNumberOrNull(after[7]),
      pos: after[8] ? String(after[8]).replace(/[()]/g, "") : null,
      exc: after[9] ? String(after[9]).replace(/[()]/g, "") : null
    },
    attack: {
      tot: toNumberOrNull(after[10]),
      err: toNumberOrNull(after[11]),
      blo: toNumberOrNull(after[12]),
      pts: toNumberOrNull(after[13]),
      ptsPercent: after[14] ? String(after[14]).replace(/[()]/g, "") : null
    },
    bk: {
      pts: toNumberOrNull(after[15])
    }
  };

  return model;
}

// ----------------- MAIN COMPONENT -----------------
export default function VolleyPdfParserFinal() {
  const [results, setResults] = useState([]); // array of players final objects
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    await processFile(f);
  }

  async function processFile(file) {
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const data = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data }).promise;

      const items = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        for (const it of content.items) {
          const width = typeof it.width === "number" ? it.width : Math.abs(it.transform[0]);
          const height = typeof it.height === "number" ? it.height : Math.abs(it.transform[3]);
          items.push({
            str: it.str,
            x: round2(it.transform[4]),
            y: round2(it.transform[5]),
            width: round2(width),
            height: round2(height),
            page: p
          });
        }
      }

      const lines = groupLines(items);

      // scan lines: detect teams and players
      const players = [];
      let currentTeam = null;
      for (const line of lines) {
        const txt = line.tokens.map(t => t.text).join(" ").trim();
        if (!txt) continue;

        const maybeTeam = detectTeamName(txt);
        if (maybeTeam) {
          currentTeam = maybeTeam;
          continue;
        }
        if (!currentTeam) continue;

        // section terminator: 'Set 1' or 'Players total' etc -> stop team
        if (/^Set\s*1\b/i.test(txt) || /^Players\s+total/i.test(txt) || /^Head Coach/i.test(txt)) {
          currentTeam = null;
          continue;
        }

        const parsed = parsePlayerLine(line);
        if (!parsed) continue;
        parsed.team = currentTeam;
        players.push(parsed);
      }

      if (!players.length) {
        setError("Nenhum jogador detectado — verifique o PDF.");
        setLoading(false);
        return;
      }

      // detect set count (OPÇÃO A: maior número consecutivo de tokens tipo set)
      const setCount = detectSetCountFromPlayers(players);
      console.log("DETECTED SET COUNT:", setCount);

      // infer anchors
      const anchors = inferColumnAnchors(players, setCount);
      console.log("Inferred anchors:", anchors);

      // map tokens -> columns and generate final model
      const final = players.map((p) => {
        const cols = mapStatTokensToColumns(p.statTokens, anchors, setCount);
        const model = columnsToModel(cols, setCount);
        const finalObj = {
          team: p.team,
          number: p.number,
          name: p.name,
          rawStats: p.rawStats,
          columns: cols,
          model
        };
        // detailed console logs for debugging/adjustment
        console.groupCollapsed(`#${p.number} ${p.name} (${p.team})`);
        console.log("rawStats:", p.rawStats);
        console.log("mappedColumns:", cols);
        console.log("finalModel:", model);
        console.groupEnd();
        return finalObj;
      });

      setResults(final);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("Erro ao processar PDF: " + (err.message || err));
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Volley PDF Parser — Final (detecção automática de sets)</h2>

      <input type="file" accept="application/pdf" onChange={onFile} />

      {loading && <p>Processando PDF...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ marginTop: 16 }}>
        <h3>Resultados ({results.length} jogadores)</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 900, width: "100%" }}>
            <thead>
              <tr style={{ background: "#0f172a", color: "white" }}>
                <th style={headCell}>Team</th>
                <th style={headCell}>#</th>
                <th style={headCell}>Name</th>
                <th style={headCell}>RawStats</th>
                <th style={headCell}>Sets / Model</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td style={cell}>{r.team}</td>
                  <td style={cell}>{r.number}</td>
                  <td style={cell}>{r.name}</td>
                  <td style={cell}><pre style={{ margin: 0 }}>{JSON.stringify(r.rawStats)}</pre></td>
                  <td style={cell}><pre style={{ margin: 0 }}>{JSON.stringify(r.model, null, 2)}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// styles
const headCell = { padding: 8, fontWeight: 700, border: "1px solid #1f2937" };
const cell = { padding: 8, border: "1px solid #e6eef7", verticalAlign: "top", fontFamily: "monospace" };
