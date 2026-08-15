import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";

const TIER_STYLE = {
  Elite: "text-stat-up bg-stat-up/10 border-stat-up/30",
  Good: "text-ink bg-ink/10 border-ink/20",
  Average: "text-ink/70 bg-ink/5 border-ink/10",
  "Below Avg": "text-ink/60 bg-ink/[0.04] border-ink/10",
};

// Fill weight has to decrease monotonically as the score drops. The straight
// shade-for-shade mapping produced /10 → /30 → /10 across the bottom three
// bands (the legacy greys ran light-to-dark, which inverts non-uniformly),
// so a 45-score bar rendered darker than a 60-score one.
function ScoreBar({ score }) {
  const color =
    score >= 75 ? "bg-stat-up" : score >= 55 ? "bg-ink" : score >= 40 ? "bg-ink/45" : "bg-ink/25";
  return (
    <div className="h-2 rounded-full bg-ink/5">
      <div className={`h-2 rounded-full ${color} transition-all duration-700`} style={{ width: `${score}%` }} />
    </div>
  );
}

function PlayerRow({ player, rank }) {
  const tierStyle = TIER_STYLE[player.tier] ?? TIER_STYLE["Average"];
  return (
    <tr className="border-t border-ink/15 hover:bg-ink/5 transition-colors">
      <td className="py-2 pr-3 text-ink/50 font-mono text-sm">{rank}</td>
      <td className="py-2 pr-4">
        <p className="text-sm font-medium text-ink">{player.player_name}</p>
      </td>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-2">
          <ScoreBar score={player.clutch_score} />
          <span className="font-mono font-bold text-sm text-ink w-10 text-right">{player.clutch_score}</span>
        </div>
      </td>
      <td className="py-2 pr-3">
        <span className={`text-xs px-2 py-0.5 rounded border ${tierStyle}`}>{player.tier}</span>
      </td>
      <td className="py-2 pr-3 font-mono text-sm text-center">
        <span className={player.clutch_pts > player.reg_pts ? "text-stat-up" : "text-stat-down"}>
          {player.clutch_pts}
        </span>
        <span className="text-ink/50"> / {player.reg_pts}</span>
      </td>
      <td className="py-2 font-mono text-xs text-ink/70 text-right">
        <span className={player.pts_delta >= 0 ? "text-stat-up" : "text-stat-down"}>
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
  const [params] = useSearchParams();
  const preRef = useRef(false);

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

  // Pre-load from ?player=id&name=… (player-profile quick action)
  useEffect(() => {
    const pid = params.get("player");
    const name = params.get("name") || "";
    if (pid && !preRef.current) {
      preRef.current = true;
      lookupPlayer(pid, name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const filtered = search && leaderboard.length
    ? leaderboard.filter(p => p.player_name.toLowerCase().includes(search.toLowerCase()))
    : leaderboard;

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">Clutch DNA Scorer</h1>
        <p className="mt-1 text-ink/70">
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
            className="rounded-xl border-2 border-ink bg-paper shadow-hoop-sm px-3 py-2 text-ink text-sm w-64"
          />
          {playerSearch.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border-2 border-ink bg-paper shadow-hoop-sm divide-y divide-ink/15">
              {playerSearch.map(p => (
                <button
                  key={p.id}
                  onClick={() => lookupPlayer(p.id, p.full_name)}
                  className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-ink/5"
                >
                  {p.full_name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={loadLeaderboard} disabled={loading} className="hoop-btn-ghost text-sm">
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {error && <p className="text-stat-down">{error}</p>}

      {playerResult && !playerResult.insufficient_sample && (
        <div className="hoop-card-outline p-4 max-w-sm space-y-2 border-terracotta/30">
          <p className="hoop-stat-label">{playerResult.player_name}</p>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-bold font-mono text-terracotta">{playerResult.clutch_score}</span>
            <span className={`text-sm px-2 py-1 rounded border ${TIER_STYLE[playerResult.tier]}`}>
              {playerResult.tier}
            </span>
          </div>
          <ScoreBar score={playerResult.clutch_score} />
          <p className="text-xs text-ink/60">
            Clutch: {playerResult.clutch_pts} PPG · Regular: {playerResult.reg_pts} PPG
          </p>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="hoop-card-outline overflow-hidden">
          <div className="px-4 py-3 border-b border-ink/15 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Clutch DNA Leaderboard</p>
            <p className="text-xs text-ink/50">min {10} clutch minutes</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm px-4">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-2 text-ink/50 font-normal text-xs">#</th>
                  <th className="px-4 py-2 text-ink/50 font-normal text-xs">Player</th>
                  <th className="px-4 py-2 text-ink/50 font-normal text-xs">Clutch Score</th>
                  <th className="px-4 py-2 text-ink/50 font-normal text-xs">Tier</th>
                  <th className="px-4 py-2 text-ink/50 font-normal text-xs text-center">Clutch / Reg PPG</th>
                  <th className="px-4 py-2 text-ink/50 font-normal text-xs text-right">Δ PPG</th>
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
