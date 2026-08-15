import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

// ── Shared helpers ───────────────────────────────────────────────────────────
function StatBadge({ label, value }) {
  return (
    <div className="text-center">
      <p className="hoop-stat-label">{label}</p>
      <p className="font-mono font-semibold text-ink">{value}</p>
    </div>
  );
}

function ReportText({ text }) {
  if (!text) return null;
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;
        if (line.startsWith("**") && line.endsWith("**"))
          return <p key={i} className="font-bold text-ink mt-3">{line.replace(/\*\*/g, "")}</p>;
        if (/^\d+\.\s\*\*/.test(line))
          return <p key={i} className="text-ink font-medium mt-2">{line.replace(/\*\*/g, "")}</p>;
        if (line.startsWith("• ") || line.startsWith("- "))
          return <p key={i} className="text-ink pl-3">• {line.slice(2)}</p>;
        return <p key={i} className="text-ink">{line}</p>;
      })}
    </div>
  );
}

// ── PDF download ─────────────────────────────────────────────────────────────
async function downloadPdf(result) {
  const res = await fetch(`${API_URL}/scouting/export-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "PDF error" }));
    throw new Error(err.detail || "PDF generation failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `HoopIQ_${(result.player_name || "Scouting").replace(/\s+/g, "_")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ScoutingReport() {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [statsTeamCtx, setStatsTeamCtx] = useState("");

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [params] = useSearchParams();
  const preRef = useRef(false);

  // Pre-select from ?player=id&name=… (player-profile quick action).
  // User clicks Generate (the Claude call is not auto-fired).
  useEffect(() => {
    const pid = params.get("player");
    const name = params.get("name") || "";
    if (pid && !preRef.current) {
      preRef.current = true;
      setSelectedPlayer({ id: pid, full_name: name });
      setSearch(name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function searchPlayers(q) {
    setSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const data = await api.searchPlayers(q);
      setSearchResults((data.players ?? data).slice(0, 8));
    } catch {}
  }

  async function runStats() {
    if (!selectedPlayer) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.scoutingReport(selectedPlayer.id, statsTeamCtx);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePdf() {
    if (!result) return;
    setPdfLoading(true);
    try {
      await downloadPdf(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">AI Scouting Report</h1>
        <p className="mt-1 text-ink/70">
          Generate a front-office-style scouting report from a player's live season stats. Powered by Claude.
        </p>
      </header>

      {/* ── Stats input ── */}
      <div className="hoop-card-outline max-w-2xl p-6 space-y-4">
        <label className="block text-sm">
          <span className="hoop-stat-label">Player</span>
          <input
            type="text"
            value={search}
            onChange={e => searchPlayers(e.target.value)}
            placeholder="Search player name…"
            className="mt-1 w-full rounded-xl border-2 border-ink bg-paper shadow-hoop-sm px-3 py-2 text-ink"
          />
          {searchResults.length > 0 && (
            <div className="mt-1 rounded-xl border-2 border-ink bg-paper shadow-hoop-sm divide-y divide-ink/15">
              {searchResults.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPlayer(p); setSearch(p.full_name); setSearchResults([]); }}
                  className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-ink/5"
                >
                  {p.full_name}
                </button>
              ))}
            </div>
          )}
        </label>
        <label className="block text-sm">
          <span className="hoop-stat-label">Evaluating fit for (optional)</span>
          <input
            type="text"
            value={statsTeamCtx}
            onChange={e => setStatsTeamCtx(e.target.value)}
            placeholder="e.g. Boston Celtics — pace-and-space"
            className="mt-1 w-full rounded-xl border-2 border-ink bg-paper shadow-hoop-sm px-3 py-2 text-ink"
          />
        </label>
        <button
          onClick={runStats}
          disabled={!selectedPlayer || loading}
          className="hoop-btn-primary"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Generating…
            </span>
          ) : "Generate Report"}
        </button>
        <p className="text-xs text-ink/50">Requires ANTHROPIC_API_KEY in services/api/.env</p>
      </div>

      {error && (
        <div className="hoop-card-outline max-w-2xl p-4 border-terracotta/30 space-y-1">
          <p className="text-stat-down text-sm">{error}</p>
          {error.includes("ANTHROPIC_API_KEY") && (
            <p className="text-ink/60 text-xs">
              Add <code className="bg-ink/5 px-1 rounded">ANTHROPIC_API_KEY=sk-ant-...</code> to{" "}
              <code className="bg-ink/5 px-1 rounded">services/api/.env</code> and restart the server.
            </p>
          )}
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div className="max-w-2xl space-y-5 animate-slide-up">

          {/* Header card */}
          <div className="hoop-card-outline p-5 space-y-3">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-ink">
                  {result.player_name}
                  {result.team && <span className="ml-2 text-ink/60 text-sm font-normal">({result.team})</span>}
                </h2>
                <p className="text-ink/60 text-xs">Stats-Based Report · {result.season}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePdf}
                  disabled={pdfLoading}
                  className="hoop-btn-ghost text-sm flex items-center gap-1.5"
                >
                  {pdfLoading ? "Generating…" : "⬇ Export PDF"}
                </button>
              </div>
            </div>

            {/* Stats row */}
            {result.stats_used && Object.keys(result.stats_used).length > 0 && (
              <div className="grid grid-cols-4 gap-3 border-t border-ink/15 pt-3">
                {[
                  ["PPG", result.stats_used.pts],
                  ["RPG", result.stats_used.reb],
                  ["APG", result.stats_used.ast],
                  ["TS%", result.stats_used.ts_pct ? `${(result.stats_used.ts_pct * 100).toFixed(1)}%` : "—"],
                ].map(([l, v]) => <StatBadge key={l} label={l} value={v} />)}
              </div>
            )}
          </div>

          {/* AI Report */}
          <div className="hoop-card-outline p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="hoop-stat-label">Scouting Report</p>
              <span className="text-xs text-ink/50">{result.model}</span>
            </div>
            <ReportText text={result.report} />
          </div>

          <p className="text-xs text-ink/50">
            {result.tokens_used} tokens · {result.model} · Data: NBA API
          </p>
        </div>
      )}
    </div>
  );
}
