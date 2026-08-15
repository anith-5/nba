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
      isWinner ? "bg-terracotta/10 border border-terracotta/20" : "bg-stat-down/5 border border-stat-down/10"
    }`}>
      <span className="text-sm text-ink">{team.team}</span>
      <span className={`font-mono font-bold text-sm ${isWinner ? "text-stat-up" : "text-stat-down"}`}>
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
        <h1 className="text-3xl font-bold text-ink">Rule Change Simulator</h1>
        <p className="mt-1 text-ink/70">
          The only public tool that models what NBA rule changes would actually do to teams and players.
        </p>
      </header>

      <div className="hoop-card-outline max-w-2xl p-6 space-y-4">
        <p className="hoop-stat-label">Select a rule change to simulate</p>
        <div className="grid gap-2">
          {SCENARIOS.map(s => (
            <label key={s.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              scenario === s.value
                ? "border-terracotta/50 bg-terracotta/10"
                : "border-ink/20 hover:border-ink/20"
            }`}>
              <input
                type="radio"
                name="scenario"
                value={s.value}
                checked={scenario === s.value}
                onChange={() => setScenario(s.value)}
                className="accent-terracotta"
              />
              <span className="text-lg">{s.icon}</span>
              <span className="text-sm text-ink">{s.label}</span>
            </label>
          ))}
        </div>
        <button onClick={simulate} disabled={loading} className="hoop-btn-primary">
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

      {error && <p className="text-stat-down">{error}</p>}

      {result && (
        <div className="space-y-5 animate-slide-up max-w-2xl">
          <div className="hoop-card-outline p-4">
            <p className="text-lg font-bold text-ink mb-1">{result.label}</p>
            <p className="text-ink/70 text-sm">{result.description}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="hoop-card-outline p-4 space-y-2">
              <p className="hoop-stat-label text-terracotta">Team Winners</p>
              <div className="space-y-2">
                {result.team_winners.map((t, i) => <TeamImpactRow key={i} team={t} isWinner={true} />)}
              </div>
            </div>
            <div className="hoop-card-outline p-4 space-y-2">
              <p className="hoop-stat-label text-stat-down">Team Losers</p>
              <div className="space-y-2">
                {result.team_losers.map((t, i) => <TeamImpactRow key={i} team={t} isWinner={false} />)}
              </div>
            </div>
          </div>

          {result.player_impacts.length > 0 && (
            <div className="hoop-card-outline p-4 space-y-2">
              <p className="hoop-stat-label mb-3">Player Impact</p>
              <div className="space-y-2">
                {result.player_impacts.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm border-t border-ink/15 pt-2">
                    <span className="text-ink font-medium min-w-[140px]">{p.player}</span>
                    <span className="text-xs text-ink/60">{p.team}</span>
                    <span className="text-ink/70 text-xs flex-1">{p.impact}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-ink/50">{result.methodology}</p>
        </div>
      )}
    </div>
  );
}
