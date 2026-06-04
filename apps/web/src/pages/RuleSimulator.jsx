import { useState, useEffect } from "react";
import { api } from "../api.js";

const SCENARIOS = [
  { value: "three_point_back", label: "Move 3-Point Line Back 2 Feet", icon: "📏" },
  { value: "no_corner_three", label: "Eliminate Corner 3-Pointers", icon: "🚫" },
  { value: "wider_lane", label: "Widen the Lane (16→20 ft)", icon: "📐" },
  { value: "four_point_line", label: "Add a 4-Point Line (30+ ft)", icon: "⭐" },
  { value: "shorter_shot_clock", label: "Shorten Shot Clock to 18s", icon: "⏱" },
];

function TeamImpactRow({ team, isWinner }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${
      isWinner ? "bg-court/10 border border-court/20" : "bg-red-500/5 border border-red-500/10"
    }`}>
      <span className="text-sm text-white">{team.team}</span>
      <span className={`font-mono font-bold text-sm ${isWinner ? "text-court-glow" : "text-red-400"}`}>
        {team.pts_change > 0 ? "+" : ""}{team.pts_change} PPG
      </span>
    </div>
  );
}

export default function RuleSimulator() {
  const [scenario, setScenario] = useState("no_corner_three");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function simulate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.simulateRule({ scenario });
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
        <h1 className="text-3xl font-bold text-white">Rule Change Simulator</h1>
        <p className="mt-1 text-slate-400">
          The only public tool that models what NBA rule changes would actually do to teams and players.
        </p>
      </header>

      <div className="card max-w-2xl p-6 space-y-4">
        <p className="stat-label">Select a rule change to simulate</p>
        <div className="grid gap-2">
          {SCENARIOS.map(s => (
            <label key={s.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              scenario === s.value
                ? "border-court/50 bg-court/10"
                : "border-slate-700 hover:border-slate-600"
            }`}>
              <input
                type="radio"
                name="scenario"
                value={s.value}
                checked={scenario === s.value}
                onChange={() => setScenario(s.value)}
                className="accent-court"
              />
              <span className="text-lg">{s.icon}</span>
              <span className="text-sm text-slate-200">{s.label}</span>
            </label>
          ))}
        </div>
        <button onClick={simulate} disabled={loading} className="btn-primary">
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Simulating…
            </span>
          ) : "Run Simulation"}
        </button>
      </div>

      {error && <p className="text-amber-300">{error}</p>}

      {result && (
        <div className="space-y-5 animate-slide-up max-w-2xl">
          <div className="card p-4">
            <p className="text-lg font-bold text-white mb-1">{result.label}</p>
            <p className="text-slate-400 text-sm">{result.description}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-4 space-y-2">
              <p className="stat-label text-court">Team Winners</p>
              <div className="space-y-2">
                {result.team_winners.map((t, i) => <TeamImpactRow key={i} team={t} isWinner={true} />)}
              </div>
            </div>
            <div className="card p-4 space-y-2">
              <p className="stat-label text-red-400">Team Losers</p>
              <div className="space-y-2">
                {result.team_losers.map((t, i) => <TeamImpactRow key={i} team={t} isWinner={false} />)}
              </div>
            </div>
          </div>

          {result.player_impacts.length > 0 && (
            <div className="card p-4 space-y-2">
              <p className="stat-label mb-3">Player Impact</p>
              <div className="space-y-2">
                {result.player_impacts.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm border-t border-slate-800 pt-2">
                    <span className="text-slate-300 font-medium min-w-[140px]">{p.player}</span>
                    <span className="text-xs text-slate-500">{p.team}</span>
                    <span className="text-slate-400 text-xs flex-1">{p.impact}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-600">{result.methodology}</p>
        </div>
      )}
    </div>
  );
}
