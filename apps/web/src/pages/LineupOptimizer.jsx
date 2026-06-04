import { useState, useEffect } from "react";
import { api } from "../api.js";

const RATING_COLOR = (v) =>
  v > 8 ? "text-court-glow" : v > 3 ? "text-court" : v > -3 ? "text-white" : v > -8 ? "text-orange-400" : "text-red-400";

function LineupCard({ lineup, rank }) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-mono">#{rank}</span>
        <div className="flex gap-4 text-right">
          <div>
            <p className="text-xs text-slate-600">NET</p>
            <p className={`font-mono font-bold text-lg ${RATING_COLOR(lineup.net_rating)}`}>
              {lineup.net_rating > 0 ? "+" : ""}{lineup.net_rating}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600">OFF</p>
            <p className="font-mono text-sm text-slate-300">{lineup.off_rating}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">DEF</p>
            <p className="font-mono text-sm text-slate-300">{lineup.def_rating}</p>
          </div>
        </div>
      </div>
      <div className="space-y-1">
        {lineup.players.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-court flex-shrink-0" />
            <span className="text-sm text-slate-200">{p}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-600 font-mono">
        {lineup.minutes} MIN · {lineup.w}W-{lineup.l}L ({lineup.gp} GP)
      </p>
    </div>
  );
}

export default function LineupOptimizer() {
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.lineupTeams().then(setTeams).catch(() => {});
  }, []);

  async function load() {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.lineupsByTeam(Number(teamId));
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
        <h1 className="text-3xl font-bold text-white">Lineup Optimizer</h1>
        <p className="mt-1 text-slate-400">
          Best 5-man lineups by net rating per 100 possessions — powered by LeagueDashLineups.
        </p>
      </header>

      <div className="card max-w-lg p-6 flex gap-4 items-end">
        <label className="flex-1 block text-sm">
          <span className="stat-label">Select team</span>
          <select
            value={teamId}
            onChange={e => setTeamId(e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="">Choose a team…</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button onClick={load} disabled={!teamId || loading} className="btn-primary">
          {loading ? "Loading…" : "Analyze"}
        </button>
      </div>

      {error && <p className="text-amber-300">{error}</p>}

      {result && (
        <div className="space-y-4 animate-slide-up">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">{result.team_name}</h2>
            <span className="text-xs text-slate-500 px-2 py-0.5 rounded bg-slate-800">
              {result.total_lineups_analyzed} lineups analyzed · min 15 min
            </span>
          </div>

          {result.lineups.length === 0 ? (
            <div className="card p-6 text-slate-400">No lineups meet the minimum minutes threshold.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.lineups.map((l, i) => (
                <LineupCard key={i} lineup={l} rank={i + 1} />
              ))}
            </div>
          )}

          <p className="text-xs text-slate-600">
            Per 100 possessions · Season: {result.season} · Data: NBA API LeagueDashLineups
          </p>
        </div>
      )}
    </div>
  );
}
