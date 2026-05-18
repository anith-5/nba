import { useState } from "react";
import { api } from "../api.js";

export default function TradeMachine() {
  const [teamA, setTeamA] = useState({ team_id: 1, team_name: "Team A", salary: 30 });
  const [teamB, setTeamB] = useState({ team_id: 2, team_name: "Team B", salary: 28 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function validate(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.validateTrade({
        sides: [
          {
            team_id: teamA.team_id,
            team_name: teamA.team_name,
            sends: [{ player_name: "Player A", salary_millions: teamA.salary }],
            receives: [{ player_name: "Player B", salary_millions: teamB.salary }],
          },
          {
            team_id: teamB.team_id,
            team_name: teamB.team_name,
            sends: [{ player_name: "Player B", salary_millions: teamB.salary }],
            receives: [{ player_name: "Player A", salary_millions: teamA.salary }],
          },
        ],
      });
      setResult(data);
    } catch (err) {
      setResult({ valid: false, messages: [err.message], salary_balanced: false });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Trade Machine</h1>
        <p className="mt-1 text-slate-400">Two-team salary swap stub — full CBA in Phase 2</p>
      </header>

      <form onSubmit={validate} className="card max-w-2xl space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="stat-label">Team A sends ($M)</span>
            <input
              type="number"
              value={teamA.salary}
              onChange={(e) => setTeamA((t) => ({ ...t, salary: Number(e.target.value) }))}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono"
            />
          </label>
          <label className="text-sm">
            <span className="stat-label">Team B sends ($M)</span>
            <input
              type="number"
              value={teamB.salary}
              onChange={(e) => setTeamB((t) => ({ ...t, salary: Number(e.target.value) }))}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono"
            />
          </label>
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          Validate trade
        </button>
      </form>

      {result && (
        <div className="card max-w-2xl space-y-3 p-6">
          <p className={`text-lg font-semibold ${result.valid ? "text-court-glow" : "text-amber-400"}`}>
            {result.valid ? "Trade valid (stub)" : "Trade blocked"}
          </p>
          <ul className="list-inside list-disc text-sm text-slate-400">
            {result.messages?.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          {result.grade && (
            <div className="grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2">
              <p>
                <span className="stat-label">Win-now</span>{" "}
                <span className="font-mono text-white">{result.grade.win_now_grade}</span>
              </p>
              <p>
                <span className="stat-label">Long-term</span>{" "}
                <span className="font-mono text-white">{result.grade.long_term_grade}</span>
              </p>
              <p className="sm:col-span-2 text-sm text-slate-400">{result.grade.summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
