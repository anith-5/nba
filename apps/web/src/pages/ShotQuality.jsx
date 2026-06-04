import { useState } from "react";
import { api } from "../api.js";

const GRADE_COLOR = {
  "A+": "text-court-glow", A: "text-court", "B+": "text-blue-400", B: "text-blue-300",
  "C+": "text-yellow-400", C: "text-yellow-500", D: "text-orange-400", F: "text-red-400",
};

function GradeBadge({ grade }) {
  return (
    <span className={`font-mono text-2xl font-bold ${GRADE_COLOR[grade] ?? "text-white"}`}>
      {grade}
    </span>
  );
}

function ZoneBar({ zone }) {
  const max = 0.75;
  return (
    <div className="grid grid-cols-[180px_1fr_80px_60px] items-center gap-3 py-2 border-t border-slate-800">
      <span className="text-sm text-slate-300 truncate">{zone.zone}</span>
      <div className="relative h-2 rounded bg-slate-800">
        <div className="absolute h-2 rounded bg-slate-600" style={{ width: `${(zone.xfg_pct / max) * 100}%` }} />
        <div
          className={`absolute h-2 rounded ${zone.delta >= 0 ? "bg-court" : "bg-red-500"}`}
          style={{ width: `${(zone.fg_pct / max) * 100}%` }}
        />
      </div>
      <span className="font-mono text-sm text-right">
        <span className={zone.delta >= 0 ? "text-court-glow" : "text-red-400"}>
          {(zone.fg_pct * 100).toFixed(1)}%
        </span>
        <span className="text-slate-600 text-xs"> / {(zone.xfg_pct * 100).toFixed(1)}%</span>
      </span>
      <span className="text-xs text-slate-500 text-right">{zone.attempts} att</span>
    </div>
  );
}

export default function ShotQuality() {
  const [playerId, setPlayerId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  async function doSearch(q) {
    setSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const data = await api.searchPlayers(q);
      setSearchResults(data.slice(0, 8));
    } catch {}
  }

  async function analyze(pid) {
    setPlayerId(pid);
    setSearchResults([]);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.shotQuality(pid);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Shot Quality (xFG%)</h1>
        <p className="mt-1 text-slate-400">
          Scores every shot zone by expected FG% — measures shot difficulty, not just makes.
        </p>
      </header>

      <div className="card max-w-xl p-6 space-y-3">
        <label className="block text-sm">
          <span className="stat-label">Search player</span>
          <input
            type="text"
            value={search}
            onChange={(e) => doSearch(e.target.value)}
            placeholder="e.g. LeBron James"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </label>
        {searchResults.length > 0 && (
          <div className="rounded border border-slate-700 bg-slate-900 divide-y divide-slate-800">
            {searchResults.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSearch(p.full_name); analyze(p.id); }}
                className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
              >
                {p.full_name}
              </button>
            ))}
          </div>
        )}
        {loading && <p className="text-slate-400 text-sm">Fetching shot chart… (~15s)</p>}
      </div>

      {error && <p className="text-amber-300">{error}</p>}

      {result && (
        <div className="space-y-4 animate-slide-up">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="card p-4 text-center sm:col-span-1">
              <p className="stat-label mb-1">Shot Grade</p>
              <GradeBadge grade={result.overall_grade} />
            </div>
            <div className="card p-4">
              <p className="stat-label">Actual FG%</p>
              <p className="stat-value">{(result.overall_fg_pct * 100).toFixed(1)}%</p>
            </div>
            <div className="card p-4">
              <p className="stat-label">Expected FG%</p>
              <p className="stat-value text-slate-400">{(result.overall_xfg_pct * 100).toFixed(1)}%</p>
            </div>
            <div className="card p-4">
              <p className="stat-label">Total Attempts</p>
              <p className="stat-value">{result.total_attempts}</p>
            </div>
          </div>

          <div className="card p-4">
            <p className="stat-label mb-1">{result.player_name} — Shot Zone Breakdown</p>
            <p className="text-xs text-slate-600 mb-3">Green bar = actual FG% · Gray bar = xFG% (expected)</p>
            {result.shot_zones.map((z) => <ZoneBar key={z.zone} zone={z} />)}
          </div>

          <p className="text-xs text-slate-600">
            Model: zone-based xFG% | Season: {result.season} | Data: NBA API
          </p>
        </div>
      )}
    </div>
  );
}
