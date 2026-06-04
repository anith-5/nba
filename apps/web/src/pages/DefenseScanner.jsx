import { useState, useEffect } from "react";
import { api } from "../api.js";

const SEVERITY_COLOR = {
  Critical: "text-red-400 bg-red-500/10 border-red-500/30",
  Exploitable: "text-orange-400 bg-orange-500/10 border-orange-500/30",
};
const STRENGTH_COLOR = "text-court-glow bg-court/10 border-court/30";

function MetricCard({ item, isVuln }) {
  const cls = isVuln ? (SEVERITY_COLOR[item.severity] ?? "text-orange-400") : STRENGTH_COLOR;
  return (
    <div className={`rounded-lg border p-3 space-y-1 ${cls}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{item.metric}</p>
        <span className="text-xs px-1.5 py-0.5 rounded bg-black/20">
          {isVuln ? item.severity : item.advantage}
        </span>
      </div>
      <div className="flex gap-4 font-mono text-xs">
        <span>Team: {(item.value * (item.metric.includes("%") ? 100 : 1)).toFixed(item.metric.includes("%") ? 1 : 1)}{item.metric.includes("%") ? "%" : ""}</span>
        <span className="text-slate-500">Lg avg: {(item.league_avg * (item.metric.includes("%") ? 100 : 1)).toFixed(1)}{item.metric.includes("%") ? "%" : ""}</span>
        <span className={isVuln ? "text-red-300" : "text-court"}>
          {item.pct_above_avg > 0 ? "+" : ""}{item.pct_above_avg}%
        </span>
      </div>
    </div>
  );
}

export default function DefenseScanner() {
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.defenseTeams().then(setTeams).catch(() => {});
  }, []);

  async function scan() {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.defenseVulnerabilities(Number(teamId));
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
        <h1 className="text-3xl font-bold text-white">Defensive Scheme Scanner</h1>
        <p className="mt-1 text-slate-400">
          Identifies exploitable weaknesses in a team's defense using opponent shooting data.
        </p>
      </header>

      <div className="card max-w-lg p-6 flex gap-4 items-end">
        <label className="flex-1 block text-sm">
          <span className="stat-label">Select team to scout</span>
          <select
            value={teamId}
            onChange={e => setTeamId(e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="">Choose a team…</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button onClick={scan} disabled={!teamId || loading} className="btn-primary">
          {loading ? "Scanning…" : "Scan Defense"}
        </button>
      </div>

      {error && <p className="text-amber-300">{error}</p>}

      {result && (
        <div className="space-y-5 animate-slide-up">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-xl font-bold text-white">{result.team_name}</h2>
            <div className="card px-3 py-1.5 text-sm">
              Def Rank: <span className="font-mono font-bold text-white">#{result.defensive_rank}</span>
            </div>
            <div className="card px-3 py-1.5 text-sm">
              Opp PPG: <span className="font-mono font-bold text-white">{result.opp_pts_per_game}</span>
            </div>
          </div>

          {result.game_plan_tips.length > 0 && (
            <div className="card p-4 space-y-2">
              <p className="stat-label">Game Plan Tips — How to Attack</p>
              {result.game_plan_tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className="text-court mt-0.5">→</span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          )}

          {result.vulnerabilities.length > 0 && (
            <div>
              <p className="stat-label mb-3">Vulnerabilities</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {result.vulnerabilities.map((v, i) => (
                  <MetricCard key={i} item={v} isVuln={true} />
                ))}
              </div>
            </div>
          )}

          {result.strengths.length > 0 && (
            <div>
              <p className="stat-label mb-3">Defensive Strengths</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {result.strengths.map((s, i) => (
                  <MetricCard key={i} item={s} isVuln={false} />
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-600">Season: {result.season} · Data: NBA API Opponent Stats</p>
        </div>
      )}
    </div>
  );
}
