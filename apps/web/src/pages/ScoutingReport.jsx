import { useState } from "react";
import { api } from "../api.js";

export default function ScoutingReport() {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [teamContext, setTeamContext] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function doSearch(q) {
    setSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const data = await api.searchPlayers(q);
      setSearchResults(data.slice(0, 8));
    } catch {}
  }

  function selectPlayer(p) {
    setSelectedPlayer(p);
    setSearch(p.full_name);
    setSearchResults([]);
  }

  async function generate() {
    if (!selectedPlayer) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.scoutingReport(selectedPlayer.id, teamContext);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const reportLines = result?.report?.split("\n") ?? [];

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">AI Scouting Report</h1>
        <p className="mt-1 text-slate-400">
          Claude reads live NBA stats and writes a professional scouting report in seconds.
        </p>
      </header>

      <div className="card max-w-2xl p-6 space-y-4">
        <label className="block text-sm">
          <span className="stat-label">Player</span>
          <input
            type="text"
            value={search}
            onChange={e => doSearch(e.target.value)}
            placeholder="Search player name…"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
          {searchResults.length > 0 && (
            <div className="mt-1 rounded border border-slate-700 bg-slate-900 divide-y divide-slate-800">
              {searchResults.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectPlayer(p)}
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
            value={teamContext}
            onChange={e => setTeamContext(e.target.value)}
            placeholder="e.g. Boston Celtics — pace-and-space, switching defense"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </label>

        <button
          onClick={generate}
          disabled={!selectedPlayer || loading}
          className="btn-primary"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Generating report…
            </span>
          ) : "Generate Report"}
        </button>

        {!selectedPlayer && (
          <p className="text-xs text-slate-600">
            Requires ANTHROPIC_API_KEY in services/api/.env
          </p>
        )}
      </div>

      {error && (
        <div className="card max-w-2xl p-4 border-amber-500/30">
          <p className="text-amber-300 text-sm">{error}</p>
          {error.includes("ANTHROPIC_API_KEY") && (
            <p className="text-slate-500 text-xs mt-2">
              Add <code className="bg-slate-800 px-1 rounded">ANTHROPIC_API_KEY=sk-ant-...</code> to{" "}
              <code className="bg-slate-800 px-1 rounded">services/api/.env</code> and restart the server.
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="max-w-2xl space-y-4 animate-slide-up">
          <div className="card p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{result.player_name}</h2>
                <p className="text-slate-400 text-sm">{result.team} · {result.season}</p>
              </div>
              <span className="text-xs text-slate-600 bg-slate-800 px-2 py-1 rounded">
                {result.model}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-3 text-center border-y border-slate-800 py-3">
              {[
                ["PPG", result.stats_used.pts],
                ["RPG", result.stats_used.reb],
                ["APG", result.stats_used.ast],
                ["TS%", result.stats_used.ts_pct ? `${(result.stats_used.ts_pct * 100).toFixed(1)}%` : "—"],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="stat-label">{label}</p>
                  <p className="font-mono font-semibold text-white">{val}</p>
                </div>
              ))}
            </div>

            <div className="prose prose-invert prose-sm max-w-none">
              {reportLines.map((line, i) => {
                if (!line.trim()) return <br key={i} />;
                if (line.startsWith("**") && line.endsWith("**")) {
                  return <p key={i} className="font-bold text-white mt-4 mb-1">{line.replace(/\*\*/g, "")}</p>;
                }
                if (line.startsWith("- ") || line.startsWith("• ")) {
                  return <p key={i} className="text-slate-300 pl-3 before:content-['•'] before:mr-2 before:text-court">{line.slice(2)}</p>;
                }
                return <p key={i} className="text-slate-300">{line}</p>;
              })}
            </div>
          </div>

          <p className="text-xs text-slate-600">
            {result.tokens_used} tokens used · Powered by {result.model}
          </p>
        </div>
      )}
    </div>
  );
}
