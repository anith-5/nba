import { useState, useRef, useCallback } from "react";
import { api } from "../api.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

// ── Shared helpers ───────────────────────────────────────────────────────────
function StatBadge({ label, value }) {
  return (
    <div className="text-center">
      <p className="stat-label">{label}</p>
      <p className="font-mono font-semibold text-white">{value}</p>
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
          return <p key={i} className="font-bold text-white mt-3">{line.replace(/\*\*/g, "")}</p>;
        if (/^\d+\.\s\*\*/.test(line))
          return <p key={i} className="text-slate-200 font-medium mt-2">{line.replace(/\*\*/g, "")}</p>;
        if (line.startsWith("• ") || line.startsWith("- "))
          return <p key={i} className="text-slate-300 pl-3">• {line.slice(2)}</p>;
        return <p key={i} className="text-slate-300">{line}</p>;
      })}
    </div>
  );
}

// ── Video upload ─────────────────────────────────────────────────────────────
function DropZone({ onFile, file }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
        dragging ? "border-court bg-court/10" :
        file ? "border-court/50 bg-court/5" : "border-slate-700 hover:border-slate-500"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/avi,video/x-matroska,.mp4,.mov,.avi,.mkv"
        className="hidden"
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); }}
      />
      {file ? (
        <div className="space-y-1">
          <p className="text-court font-medium">✓ {file.name}</p>
          <p className="text-slate-500 text-xs">{(file.size / (1024 * 1024)).toFixed(1)} MB · Click to change</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-4xl">🎥</div>
          <p className="text-slate-300 font-medium">Drop video here or click to upload</p>
          <p className="text-slate-600 text-xs">MP4, MOV, AVI, MKV · Max 150 MB</p>
          <p className="text-slate-700 text-xs mt-1">
            Best results: single-player drill footage, full-body visible, good lighting
          </p>
        </div>
      )}
    </div>
  );
}

// ── Biomechanics metrics display ─────────────────────────────────────────────
const METRIC_EXPLANATIONS = {
  dominant_hand:     "Primary dribbling / shooting hand detected from wrist position patterns",
  drive_direction:   "Lateral center-of-mass drift — which way the player attacks",
  avg_r_elbow_angle: "Right-arm elbow angle during shooting phases (ideal ≈ 90°)",
  avg_knee_bend:     "Average knee angle during movement (lower = more athletic)",
  jump_count:        "Jump events detected (estimated shot attempts)",
  release_height:    "Estimated wrist height at shot release",
  movement_pace:     "Overall lateral movement speed",
  lateral_quickness: "Estimated quickness based on pace and drive frequency",
};

function MetricCard({ label, value, explanation, highlight }) {
  return (
    <div className={`card p-3 space-y-1 ${highlight ? "border-court/30" : ""}`}>
      <p className="stat-label text-xs">{label}</p>
      <p className={`font-mono font-bold text-sm ${highlight ? "text-court-glow" : "text-white"}`}>
        {typeof value === "number" ? value.toFixed(1) : value}
      </p>
      {explanation && <p className="text-slate-600 text-xs leading-tight">{explanation}</p>}
    </div>
  );
}

function ConfidenceBadge({ conf }) {
  const color = conf >= 0.7 ? "text-court-glow" : conf >= 0.4 ? "text-yellow-400" : "text-red-400";
  const label = conf >= 0.7 ? "High" : conf >= 0.4 ? "Medium" : "Low";
  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      Analysis confidence: {label} ({(conf * 100).toFixed(0)}%)
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
  const [mode, setMode] = useState("video"); // "video" | "stats"

  // Video mode state
  const [videoFile, setVideoFile] = useState(null);
  const [playerName, setPlayerName] = useState("");
  const [teamCtx, setTeamCtx] = useState("");

  // Stats mode state
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [statsTeamCtx, setStatsTeamCtx] = useState("");

  // Shared
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function searchPlayers(q) {
    setSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const data = await api.searchPlayers(q);
      setSearchResults(data.slice(0, 8));
    } catch {}
  }

  async function runVideo() {
    if (!videoFile) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setLoadingMsg("Uploading video…");

    try {
      const form = new FormData();
      form.append("video", videoFile);
      form.append("player_name", playerName);
      form.append("team_context", teamCtx);

      setLoadingMsg("Running MediaPipe pose analysis… (~30–90s)");
      const res = await fetch(`${API_URL}/scouting/video`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Request failed");
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }

  async function runStats() {
    if (!selectedPlayer) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setLoadingMsg("Fetching player stats…");
    try {
      const data = await api.scoutingReport(selectedPlayer.id, statsTeamCtx);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMsg("");
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

  const m = result?.metrics;

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">AI Scouting Report</h1>
        <p className="mt-1 text-slate-400">
          Upload game footage for biomechanical analysis — or generate from live stats.
          Powered by MediaPipe Pose + Claude.
        </p>
      </header>

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-slate-900 w-fit">
        {[["video", "🎥 Video Analysis"], ["stats", "📊 Stats-Based"]].map(([v, label]) => (
          <button
            key={v}
            onClick={() => { setMode(v); setResult(null); setError(null); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              mode === v ? "bg-court text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Video mode ── */}
      {mode === "video" && (
        <div className="card max-w-2xl p-6 space-y-5">
          <DropZone onFile={setVideoFile} file={videoFile} />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="stat-label">Player name (optional)</span>
              <input
                type="text"
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                placeholder="e.g. Jayson Tatum"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="stat-label">Defending team context (optional)</span>
              <input
                type="text"
                value={teamCtx}
                onChange={e => setTeamCtx(e.target.value)}
                placeholder="e.g. Miami Heat switch-heavy"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white text-sm"
              />
            </label>
          </div>

          <div className="text-xs text-slate-600 space-y-1">
            <p>⚙ Pipeline: OpenCV frame extraction → MediaPipe Pose landmark detection →</p>
            <p>&nbsp;&nbsp;&nbsp;Elbow/knee angle analysis → Drive-direction tracking → Claude tactical report</p>
          </div>

          <button
            onClick={runVideo}
            disabled={!videoFile || loading}
            className="btn-primary w-full justify-center"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                {loadingMsg || "Analyzing…"}
              </span>
            ) : "Analyze Video & Generate Report"}
          </button>
        </div>
      )}

      {/* ── Stats mode ── */}
      {mode === "stats" && (
        <div className="card max-w-2xl p-6 space-y-4">
          <label className="block text-sm">
            <span className="stat-label">Player</span>
            <input
              type="text"
              value={search}
              onChange={e => searchPlayers(e.target.value)}
              placeholder="Search player name…"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
            {searchResults.length > 0 && (
              <div className="mt-1 rounded border border-slate-700 bg-slate-900 divide-y divide-slate-800">
                {searchResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPlayer(p); setSearch(p.full_name); setSearchResults([]); }}
                    className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
                  >
                    {p.full_name}
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="block text-sm">
            <span className="stat-label">Evaluating fit for (optional)</span>
            <input
              type="text"
              value={statsTeamCtx}
              onChange={e => setStatsTeamCtx(e.target.value)}
              placeholder="e.g. Boston Celtics — pace-and-space"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          <button
            onClick={runStats}
            disabled={!selectedPlayer || loading}
            className="btn-primary"
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
          <p className="text-xs text-slate-600">Requires ANTHROPIC_API_KEY in services/api/.env</p>
        </div>
      )}

      {error && (
        <div className="card max-w-2xl p-4 border-amber-500/30 space-y-1">
          <p className="text-amber-300 text-sm">{error}</p>
          {error.includes("ANTHROPIC_API_KEY") && (
            <p className="text-slate-500 text-xs">
              Add <code className="bg-slate-800 px-1 rounded">ANTHROPIC_API_KEY=sk-ant-...</code> to{" "}
              <code className="bg-slate-800 px-1 rounded">services/api/.env</code> and restart the server.
            </p>
          )}
          {error.includes("mediapipe") && (
            <p className="text-slate-500 text-xs">
              Run in venv: <code className="bg-slate-800 px-1 rounded">pip install mediapipe opencv-python-headless</code>
            </p>
          )}
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div className="max-w-2xl space-y-5 animate-slide-up">

          {/* Header card */}
          <div className="card p-5 space-y-3">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {result.player_name}
                  {result.team && <span className="ml-2 text-slate-500 text-sm font-normal">({result.team})</span>}
                </h2>
                <p className="text-slate-500 text-xs">
                  {result.mode === "video" ? "Video Biomechanical Analysis" : "Stats-Based Report"} · {result.season}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePdf}
                  disabled={pdfLoading}
                  className="btn-ghost text-sm flex items-center gap-1.5"
                >
                  {pdfLoading ? "Generating…" : "⬇ Export PDF"}
                </button>
              </div>
            </div>

            {/* Stats row for stats mode */}
            {result.stats_used && Object.keys(result.stats_used).length > 0 && (
              <div className="grid grid-cols-4 gap-3 border-t border-slate-800 pt-3">
                {[
                  ["PPG", result.stats_used.pts],
                  ["RPG", result.stats_used.reb],
                  ["APG", result.stats_used.ast],
                  ["TS%", result.stats_used.ts_pct ? `${(result.stats_used.ts_pct * 100).toFixed(1)}%` : "—"],
                ].map(([l, v]) => <StatBadge key={l} label={l} value={v} />)}
              </div>
            )}
          </div>

          {/* Biomechanics grid — video mode only */}
          {result.mode === "video" && m && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="stat-label">Biomechanical Analysis</p>
                <ConfidenceBadge conf={m.confidence} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard label="Dominant Hand"      value={m.dominant_hand}      highlight explanation={METRIC_EXPLANATIONS.dominant_hand} />
                <MetricCard label="Drive Direction"    value={m.drive_direction}    highlight explanation={METRIC_EXPLANATIONS.drive_direction} />
                <MetricCard label="Shooting Elbow °"   value={m.avg_r_elbow_angle}  explanation={METRIC_EXPLANATIONS.avg_r_elbow_angle} />
                <MetricCard label="Avg Knee Bend °"    value={m.avg_knee_bend}      explanation={METRIC_EXPLANATIONS.avg_knee_bend} />
                <MetricCard label="Jump Events"        value={m.jump_count}         explanation={METRIC_EXPLANATIONS.jump_count} />
                <MetricCard label="Release Height"     value={m.release_height}     explanation={METRIC_EXPLANATIONS.release_height} />
                <MetricCard label="Movement Pace"      value={m.movement_pace}      explanation={METRIC_EXPLANATIONS.movement_pace} />
                <MetricCard label="Lateral Quickness"  value={m.lateral_quickness}  explanation={METRIC_EXPLANATIONS.lateral_quickness} />
              </div>

              <div className="flex gap-4 text-xs text-slate-600">
                <span>{m.frames_analyzed} frames analyzed</span>
                <span>{m.duration_seconds}s video</span>
                <span>{m.fps} fps</span>
              </div>

              {m.analysis_notes?.length > 0 && (
                <div className="card p-3 space-y-1">
                  {m.analysis_notes.map((n, i) => (
                    <p key={i} className="text-xs text-yellow-400">⚠ {n}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Report */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="stat-label">
                {result.mode === "video" ? "Defensive Game Plan" : "Scouting Report"}
              </p>
              <span className="text-xs text-slate-600">{result.model}</span>
            </div>
            <ReportText text={result.report} />
          </div>

          <p className="text-xs text-slate-600">
            {result.tokens_used} tokens · {result.model} · Data: NBA API + MediaPipe Pose
          </p>
        </div>
      )}
    </div>
  );
}
