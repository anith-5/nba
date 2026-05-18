import { useState } from "react";
import { api } from "../api.js";

export default function Predictions() {
  const [form, setForm] = useState({
    home_team_id: 1610612747,
    away_team_id: 1610612738,
    home_win_pct: 0.65,
    away_win_pct: 0.72,
    home_rest_days: 2,
    away_rest_days: 1,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function predict(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.predictGame({
        ...form,
        home_win_pct: Number(form.home_win_pct),
        away_win_pct: Number(form.away_win_pct),
        home_rest_days: Number(form.home_rest_days),
        away_rest_days: Number(form.away_rest_days),
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">AI Game Predictions</h1>
        <p className="mt-1 text-slate-400">
          Baseline heuristic model — your ML team replaces this in Phase 3
        </p>
      </header>

      <form onSubmit={predict} className="card grid max-w-xl gap-4 p-6 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="stat-label">Home win %</span>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={form.home_win_pct}
            onChange={(e) => update("home_win_pct", e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono"
          />
        </label>
        <label className="block text-sm">
          <span className="stat-label">Away win %</span>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={form.away_win_pct}
            onChange={(e) => update("away_win_pct", e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono"
          />
        </label>
        <label className="block text-sm">
          <span className="stat-label">Home rest days</span>
          <input
            type="number"
            min="0"
            max="7"
            value={form.home_rest_days}
            onChange={(e) => update("home_rest_days", e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono"
          />
        </label>
        <label className="block text-sm">
          <span className="stat-label">Away rest days</span>
          <input
            type="number"
            min="0"
            max="7"
            value={form.away_rest_days}
            onChange={(e) => update("away_rest_days", e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono"
          />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Predicting…" : "Run prediction"}
          </button>
        </div>
      </form>

      {error && <p className="text-amber-300">{error}</p>}

      {result && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card p-4">
            <p className="stat-label">Home win prob</p>
            <p className="stat-value text-court-glow">{(result.home_win_prob * 100).toFixed(1)}%</p>
          </div>
          <div className="card p-4">
            <p className="stat-label">Projected score</p>
            <p className="stat-value font-mono text-lg">
              {result.projected_home_score} – {result.projected_away_score}
            </p>
          </div>
          <div className="card p-4">
            <p className="stat-label">Confidence</p>
            <p className="stat-value capitalize">{result.confidence}</p>
          </div>
          <div className="card p-4">
            <p className="stat-label">Upset alert</p>
            <p className="stat-value">{result.upset_alert ? "Yes" : "No"}</p>
          </div>
        </div>
      )}
      {result && (
        <p className="text-sm text-slate-500">
          Model: {result.model_version} — {result.notes}
        </p>
      )}
    </div>
  );
}
