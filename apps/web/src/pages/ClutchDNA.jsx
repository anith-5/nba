import { useState, useEffect } from "react";
import { api } from "../api.js";

const TIER_STYLE = {
  Elite: "text-court-glow bg-court/10 border-court/30",
  Good: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  Average: "text-slate-300 bg-slate-700/30 border-slate-600/30",
  "Below Avg": "text-orange-400 bg-orange-500/10 border-orange-500/30",
};

function ScoreBar({ score }) {
  const color =
    score >= 75 ? "bg-court" : score >= 55 ? "bg-blue-500" : score >= 40 ? "bg-slate-500" : "bg-orange-500";
  return (
    <div className="h-2 rounded-full bg-slate-800">
      <div className={`h-2 rounded-full ${color} transition-all duration-700`} style={{ width: `${score}%` }} />
    </div>
  );
}

function PlayerRow({ player, rank }) {
  const tierStyle = TIER_STYLE[player.tier] ?? TIER_STYLE["Average"];
  return (
    <tr className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors">
      <td className="py-2 pr-3 text-slate-600 font-mono text-sm">{rank}</td>
      <td className="py-2 pr-4">
        <p className="text-sm font-medium text-white">{player.player_name}</p>
      </td>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-2">
          <ScoreBar score={player.clutch_score} />
          <span className="font-mono font-bold text-sm text-white w-10 text-right">{player.clutch_score}</span>
        </div>
      </td>
      <td className="py-2 pr-3">
        <span className={`text-xs px-2 py-0.5 rounded border ${tierStyle}`}>{player.tier}</span>
      </td>
      <td className="py-2 pr-3 font-mono text-sm text-center">
        <span className={player.clutch_pts > player.reg_pts ? "text-court-glow" : "text-red-400"}>
          {player.clutch_pts}
        </span>
        <span className="text-slate-600"> / {player.reg_pts}</span>
      </td>
      <td className="py-2 font-mono text-xs text-slate-400 text-right">
        <span className={player.pts_delta >= 0 ? "text-court-glow" : "text-red-400"}>
          {player.pts_delta >= 0 ? "+" : ""}{player.pts_delta} PPG
        </span>
      </td>
    </tr>
  );
}

export default function ClutchDNA() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [playerResult, setPlayerResult] = useState(null);
  const [playerSearch, setPlayerSearch] = useState([]);

  async function loadLeaderboard() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.clutchLeaderboard(25);
      setLeaderboard(data.players);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function doSearch(q) {
    setSearch(q);
    if (q.length < 2) { setPlayerSearch([]); return; }
    try {
      const data = await api.searchPlayers(q);
      setPlayerSearch((data.players ?? data).slice(0, 6));
    } catch {}
  }

  async function lookupPlayer(pid, name) {
    setSearch(name);
    setPlayerSearch([]);
    try {
      const data = await api.clutchPlayer(pid);
      setPlayerResult(data);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { loadLeaderboard(); }, []);

  const filtered = search && leaderboard.length
    ? leaderboard.filter(p => p.player_name.toLowerCase().includes(search.toLowerCase()))
    : leaderboard;

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Clutch DNA Scorer</h1>
        <p className="mt-1 text-slate-400">
          Measures performance under pressure — last 5 min, margin ≤5. Score 0–100.
        </p>
      </header>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={e => { doSearch(e.target.value); setPlayerResult(null); }}
            placeholder="Search player or filter table…"
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white text-sm w-64"
          />
          {playerSearch.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded border border-slate-700 bg-slate-900 divide-y divide-slate-800">
              {playerSearch.map(p => (
                <button
                  key={p.id}
                  onClick={() => lookupPlayer(p.id, p.full_name)}
                  className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
                >
                  {p.full_name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={loadLeaderboard} disabled={loading} className="btn-ghost text-sm">
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {error && <p className="text-amber-300">{error}</p>}

      {playerResult && !playerResult.insufficient_sample && (
        <div className="card p-4 max-w-sm space-y-2 border-court/30">
          <p className="stat-label">{playerResult.player_name}</p>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-bold font-mono text-court-glow">{playerResult.clutch_score}</span>
            <span className={`text-sm px-2 py-1 rounded border ${TIER_STYLE[playerResult.tier]}`}>
              {playerResult.tier}
            </span>
          </div>
          <ScoreBar score={playerResult.clutch_score} />
          <p className="text-xs text-slate-500">
            Clutch: {playerResult.clutch_pts} PPG · Regular: {playerResult.reg_pts} PPG
          </p>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Clutch DNA Leaderboard</p>
            <p className="text-xs text-slate-600">min {10} clutch minutes</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm px-4">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-2 text-slate-600 font-normal text-xs">#</th>
                  <th className="px-4 py-2 text-slate-600 font-normal text-xs">Player</th>
                  <th className="px-4 py-2 text-slate-600 font-normal text-xs">Clutch Score</th>
                  <th className="px-4 py-2 text-slate-600 font-normal text-xs">Tier</th>
                  <th className="px-4 py-2 text-slate-600 font-normal text-xs text-center">Clutch / Reg PPG</th>
                  <th className="px-4 py-2 text-slate-600 font-normal text-xs text-right">Δ PPG</th>
                </tr>
              </thead>
              <tbody className="px-4">
                {filtered.map((p, i) => <PlayerRow key={p.player_id} player={p} rank={i + 1} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
