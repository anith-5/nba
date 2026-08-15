import { useState, useEffect } from "react";
import { api } from "../api.js";

function ProbGauge({ prob, homeTeam, awayTeam }) {
  const homePct = Math.round(prob * 100);
  const awayPct = 100 - homePct;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-mono">
        <span className="text-terracotta font-bold">{homeTeam} {homePct}%</span>
        <span className="text-ink/70">{awayTeam} {awayPct}%</span>
      </div>
      <div className="h-4 rounded-full bg-ink/5 overflow-hidden flex">
        <div className="h-full bg-terracotta transition-all duration-700" style={{ width: `${homePct}%` }} />
        <div className="h-full bg-ink/20 flex-1" />
      </div>
    </div>
  );
}

// Named distinctly from the shared components/GameCard.jsx (live NBA
// scoreboard tile used by Games.jsx) -- this one adds a win-probability
// gauge and isn't the same component, despite the identical name it had
// before. Pure rename, no behavior change.
function ProbabilityGameCard({ game }) {
  const isLive = game.status === "Live";
  const isFinal = game.status === "Final";
  return (
    <div className={`hoop-card-outline p-4 space-y-3 ${isLive ? "border-terracotta/40" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isLive ? "bg-stat-down/20 text-stat-down" :
            isFinal ? "bg-ink/10 text-ink/70" :
            "bg-ink/5 text-ink/60"
          }`}>
            {isLive ? "● LIVE" : game.status}
            {isLive && ` Q${game.period}`}
          </span>
        </div>
        <span className="text-xs text-ink/50 font-mono">
          {game.minutes_elapsed.toFixed(0)}' elapsed
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-center">
          <p className="font-bold text-ink text-lg">{game.home_team}</p>
          <p className="text-3xl font-mono font-bold text-terracotta">{game.home_score}</p>
          <p className="text-xs text-ink/60">Home</p>
        </div>
        <div className="text-ink/50 text-xl font-light">@</div>
        <div className="text-center">
          <p className="font-bold text-ink text-lg">{game.away_team}</p>
          <p className="text-3xl font-mono font-bold text-ink">{game.away_score}</p>
          <p className="text-xs text-ink/60">Away</p>
        </div>
      </div>

      {(isLive || isFinal) && (
        <ProbGauge
          prob={game.home_win_prob}
          homeTeam={game.home_team}
          awayTeam={game.away_team}
        />
      )}
    </div>
  );
}

export default function WinProbability() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Manual calculator
  const [diff, setDiff] = useState(0);
  const [elapsed, setElapsed] = useState(24);
  const [calcResult, setCalcResult] = useState(null);

  async function loadGames() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.winProbLive();
      setGames(data.games);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function calculate() {
    try {
      const data = await api.winProbCalc({ score_diff: Number(diff), minutes_elapsed: Number(elapsed) });
      setCalcResult(data);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { loadGames(); }, []);

  const liveGames = games.filter(g => g.status === "Live");
  const finalGames = games.filter(g => g.status === "Final");
  const upcomingGames = games.filter(g => g.status === "Upcoming");

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink">Live Win Probability</h1>
          <p className="mt-1 text-ink/70">
            Updated every possession — Gaussian diffusion model (σ = 11 pts)
          </p>
        </div>
        <button onClick={loadGames} disabled={loading} className="hoop-btn-ghost text-sm">
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </header>

      {lastUpdated && <p className="text-xs text-ink/50">Last updated: {lastUpdated}</p>}
      {error && <p className="text-stat-down">{error}</p>}

      {liveGames.length > 0 && (
        <div>
          <p className="hoop-stat-label mb-3">Live Games</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveGames.map(g => <ProbabilityGameCard key={g.game_id} game={g} />)}
          </div>
        </div>
      )}

      {finalGames.length > 0 && (
        <div>
          <p className="hoop-stat-label mb-3">Final</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {finalGames.map(g => <ProbabilityGameCard key={g.game_id} game={g} />)}
          </div>
        </div>
      )}

      {upcomingGames.length > 0 && (
        <div>
          <p className="hoop-stat-label mb-3">Upcoming Today</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingGames.map(g => <ProbabilityGameCard key={g.game_id} game={g} />)}
          </div>
        </div>
      )}

      {games.length === 0 && !loading && (
        <div className="hoop-card-outline p-6 text-ink/70">No games found for today. Try refreshing.</div>
      )}

      {/* Manual calculator */}
      <div className="hoop-card-outline p-6 max-w-lg space-y-4">
        <p className="font-semibold text-ink">Win Probability Calculator</p>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="hoop-stat-label">Score diff (home − away)</span>
            <input
              type="number"
              value={diff}
              onChange={e => setDiff(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-ink bg-paper shadow-hoop-sm px-3 py-2 font-mono text-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="hoop-stat-label">Minutes elapsed (0–48)</span>
            <input
              type="number"
              min="0"
              max="48"
              value={elapsed}
              onChange={e => setElapsed(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-ink bg-paper shadow-hoop-sm px-3 py-2 font-mono text-ink"
            />
          </label>
        </div>
        <button onClick={calculate} className="hoop-btn-primary">Calculate</button>
        {calcResult && (
          <div className="flex gap-6 mt-2">
            <div>
              <p className="hoop-stat-label">Home win prob</p>
              <p className="hoop-stat-value text-terracotta">{(calcResult.home_win_prob * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="hoop-stat-label">Away win prob</p>
              <p className="hoop-stat-value">{(calcResult.away_win_prob * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="hoop-stat-label">Mins remaining</p>
              <p className="hoop-stat-value text-ink/70">{calcResult.minutes_remaining}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
