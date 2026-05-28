import { useState, useEffect } from "react";
import { api } from "../api.js";

const TEAMS = [
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
  "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
  "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
];

function ProbBar({ prob, color = "bg-court" }) {
  return (
    <div className="mt-2 h-2 rounded-full bg-slate-800">
      <div
        className={`h-2 rounded-full ${color} transition-all duration-500`}
        style={{ width: `${prob * 100}%` }}
      />
    </div>
  );
}

function FeatureRow({ label, value, note, positive }) {
  const isNumber = typeof value === "number";
  const colorClass =
    positive === null || !isNumber
      ? "text-white"
      : positive
      ? value > 0 ? "text-court-glow" : "text-red-400"
      : value < 0 ? "text-court-glow" : "text-red-400";

  return (
    <tr className="border-t border-slate-800">
      <td className="py-2 pr-4 text-slate-400">{label}</td>
      <td className={`py-2 font-mono text-right ${colorClass}`}>
        {isNumber ? (value > 0 ? `+${value}` : String(value)) : value}
      </td>
      <td className="py-2 pl-3 text-slate-600 text-xs">{note ?? ""}</td>
    </tr>
  );
}

export default function Predictions() {
  const [status, setStatus] = useState({ is_trained: false, is_training: false, error: null });
  const [settingUp, setSettingUp] = useState(false);
  const [home, setHome] = useState("LAL");
  const [away, setAway] = useState("BOS");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.predictionStatus().then(setStatus).catch(() => {});
  }, []);

  async function setupModel() {
    setSettingUp(true);
    setError(null);
    try {
      await api.setupPrediction();
      setStatus({ is_trained: true, is_training: false, error: null });
    } catch (e) {
      setError(e.message);
    } finally {
      setSettingUp(false);
    }
  }

  async function predict(e) {
    e.preventDefault();
    if (home === away) {
      setError("Home and away teams must be different.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.predictGame({ home_abbr: home, away_abbr: away });
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
        <h1 className="text-3xl font-bold text-white">AI Game Predictions</h1>
        <p className="mt-1 text-slate-400">
          Stacked logistic regression ensemble trained on live NBA data —
          OffRtg · DefRtg · Pace · H2H · Rest · Injuries · Last-10
        </p>
      </header>

      {/* Model setup */}
      {!status.is_trained && (
        <div className="card max-w-xl p-6 space-y-4">
          <div>
            <p className="text-white font-semibold mb-1">Model not loaded</p>
            <p className="text-slate-400 text-sm">
              Clicking the button below fetches live NBA stats from the NBA API
              and trains a 3-model ensemble. This takes about 30–90 seconds.
            </p>
          </div>
          <button onClick={setupModel} disabled={settingUp} className="btn-primary">
            {settingUp ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Fetching data &amp; training…
              </span>
            ) : "Load &amp; Train Model"}
          </button>
          {status.error && (
            <p className="text-amber-300 text-sm">{status.error}</p>
          )}
        </div>
      )}

      {/* Model ready badge */}
      {status.is_trained && (
        <div className="flex items-center gap-2 text-sm text-court">
          <span className="inline-block h-2 w-2 rounded-full bg-court" />
          Model loaded and ready
        </div>
      )}

      {/* Prediction form */}
      {status.is_trained && (
        <form onSubmit={predict} className="card max-w-2xl p-6">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex-1 min-w-[120px] block text-sm">
              <span className="stat-label">Home team</span>
              <select
                value={home}
                onChange={(e) => setHome(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white"
              >
                {TEAMS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>

            <span className="text-slate-500 text-2xl font-light pb-2">@</span>

            <label className="flex-1 min-w-[120px] block text-sm">
              <span className="stat-label">Away team</span>
              <select
                value={away}
                onChange={(e) => setAway(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white"
              >
                {TEAMS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Predicting…
                </span>
              ) : "Predict"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Fetches current rest days, last-10 record, and injury data live — takes ~10 s.
          </p>
        </form>
      )}

      {error && <p className="text-amber-300">{error}</p>}

      {/* Results */}
      {result && (
        <div className="space-y-4 animate-slide-up">
          {/* Winner banner */}
          <div className="card p-6 text-center">
            <p className="stat-label mb-2">
              {result.away_team} @ {result.home_team}
            </p>
            <p className="text-5xl font-bold text-court-glow">{result.predicted_winner}</p>
            <p className="mt-2 text-slate-300">
              wins by ~<span className="font-mono font-semibold">{result.predicted_margin}</span> pts
              &nbsp;·&nbsp;
              <span className={
                result.confidence === "High" ? "text-court-glow" :
                result.confidence === "Medium" ? "text-yellow-400" : "text-slate-400"
              }>
                {result.confidence} confidence
              </span>
            </p>
          </div>

          {/* Win probability bars */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-4">
              <p className="stat-label">{result.home_team} (home)</p>
              <p className="stat-value text-court-glow">
                {(result.home_win_prob * 100).toFixed(1)}%
              </p>
              <ProbBar prob={result.home_win_prob} color="bg-court" />
            </div>
            <div className="card p-4">
              <p className="stat-label">{result.away_team} (away)</p>
              <p className="stat-value text-slate-300">
                {(result.away_win_prob * 100).toFixed(1)}%
              </p>
              <ProbBar prob={result.away_win_prob} color="bg-slate-500" />
            </div>
          </div>

          {/* Model ensemble votes */}
          <div className="card p-4">
            <p className="stat-label mb-3">Ensemble votes (3 models)</p>
            <div className="flex gap-6">
              {result.model_votes.map((v, i) => (
                <div key={i} className="text-center">
                  <p className="text-xs text-slate-500 mb-1">Model {i + 1}</p>
                  <p className="font-mono text-xl text-white">{(v * 100).toFixed(1)}%</p>
                  <p className="text-xs text-slate-600">home win</p>
                </div>
              ))}
            </div>
          </div>

          {/* Feature breakdown */}
          <div className="card p-4">
            <p className="stat-label mb-3">Feature breakdown (home − away)</p>
            <table className="w-full text-sm">
              <tbody>
                <FeatureRow
                  label="Offensive Rating diff"
                  value={result.features.off_rtg_diff}
                  positive={true}
                />
                <FeatureRow
                  label="Defensive Rating diff"
                  value={result.features.def_rtg_diff}
                  positive={false}
                  note="lower = better defense"
                />
                <FeatureRow
                  label="Net Rating diff"
                  value={result.features.net_rtg_diff}
                  positive={true}
                />
                <FeatureRow
                  label="Pace diff"
                  value={result.features.pace_diff}
                  positive={null}
                />
                <FeatureRow
                  label="Rest days"
                  value={`Home ${result.features.home_rest_days}d  /  Away ${result.features.away_rest_days}d`}
                  positive={null}
                />
                <FeatureRow
                  label="Last-10 record"
                  value={`Home ${result.features.home_last10}  /  Away ${result.features.away_last10}`}
                  positive={null}
                />
                <FeatureRow
                  label="Head-to-head (home)"
                  value={result.features.h2h_record}
                  positive={null}
                />
                <FeatureRow
                  label="Injury impact (MPG lost)"
                  value={result.features.injury_diff}
                  positive={false}
                  note="negative = home team hurt more"
                />
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-600">
            Model: {result.model_version} · Data: NBA API (nba_api)
          </p>
        </div>
      )}
    </div>
  );
}
