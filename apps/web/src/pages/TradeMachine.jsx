import { useState, useEffect, useRef } from "react";
import { api } from "../api.js";

const GRADE_COLOR = {
  "A+": "text-court-glow", "A": "text-court-glow", "A-": "text-court-glow",
  "B+": "text-green-400", "B": "text-green-400", "B-": "text-green-400",
  "C+": "text-yellow-400", "C": "text-yellow-400", "C-": "text-yellow-400",
  "D+": "text-orange-400", "D": "text-orange-400",
  "F": "text-red-400",
};

const LIKELIHOOD_COLOR = {
  "Very Likely": "text-court-glow",
  "Likely": "text-green-400",
  "Possible": "text-yellow-400",
  "Unlikely": "text-orange-400",
  "Very Unlikely": "text-red-400",
};

function PlayerSearch({ onAdd }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  function handleInput(e) {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timer.current);
    if (val.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.tradePlayerSearch(val);
        setResults(data);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
  }

  function pick(player) {
    onAdd(player);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={handleInput}
        placeholder="Search NBA players…"
        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500"
      />
      {(results.length > 0 || loading) && (
        <div className="absolute z-20 mt-1 w-full rounded border border-slate-700 bg-slate-900 shadow-xl">
          {loading && <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>}
          {results.map((p) => (
            <button
              key={p.player_id}
              onClick={() => pick(p)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800 text-left"
            >
              <span className="text-sm text-white">{p.name}</span>
              <span className="text-xs text-slate-400">{p.team} · {p.pts} PPG</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamPanel({ label, teams, side, onChange }) {
  function setTeam(abbr) {
    const t = teams.find(x => x.abbreviation === abbr);
    onChange({ ...side, team_abbr: abbr, team_name: t?.name || abbr, sends: [] });
  }

  function addPlayer(player) {
    const already = side.sends.find(p => p.name === player.name);
    if (already) return;
    onChange({ ...side, sends: [...side.sends, { name: player.name, salary_millions: player.salary_millions ?? 0 }] });
  }

  function updateSalary(idx, val) {
    const sends = side.sends.map((p, i) => i === idx ? { ...p, salary_millions: parseFloat(val) || 0 } : p);
    onChange({ ...side, sends });
  }

  function removePlayer(idx) {
    onChange({ ...side, sends: side.sends.filter((_, i) => i !== idx) });
  }

  const totalSalary = side.sends.reduce((s, p) => s + p.salary_millions, 0);

  return (
    <div className="card p-5 space-y-4 flex-1">
      <p className="stat-label">{label}</p>

      <select
        value={side.team_abbr}
        onChange={e => setTeam(e.target.value)}
        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
      >
        <option value="">— Select team —</option>
        {teams.map(t => (
          <option key={t.abbreviation} value={t.abbreviation}>{t.name}</option>
        ))}
      </select>

      {side.team_abbr && (
        <>
          <div>
            <p className="text-xs text-slate-500 mb-2">Players sent out by {side.team_abbr}</p>
            <PlayerSearch onAdd={addPlayer} />
          </div>

          {side.sends.length > 0 && (
            <div className="space-y-2">
              {side.sends.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-white flex-1 truncate">{p.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={p.salary_millions}
                      onChange={e => updateSalary(i, e.target.value)}
                      className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-mono text-white"
                    />
                    <span className="text-xs text-slate-500">M</span>
                  </div>
                  <button onClick={() => removePlayer(i)} className="text-slate-600 hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
              <p className="text-xs text-slate-500 text-right">
                Total outgoing: <span className="font-mono text-white">${totalSalary.toFixed(1)}M</span>
              </p>
            </div>
          )}

          {side.sends.length === 0 && (
            <p className="text-xs text-slate-600 italic">No players added yet</p>
          )}
        </>
      )}
    </div>
  );
}

function SalaryBar({ label, value, max, ok }) {
  const pct = Math.min(100, (value / Math.max(max, 0.1)) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={`font-mono ${ok ? "text-court-glow" : "text-red-400"}`}>
          ${value.toFixed(1)}M / ${max.toFixed(1)}M max
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800">
        <div
          className={`h-1.5 rounded-full transition-all ${ok ? "bg-court" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TeamResult({ data, isA }) {
  return (
    <div className="card p-5 space-y-4 flex-1">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-lg font-bold text-white">{data.team}</p>
          <p className="text-xs text-slate-500">GM: {data.gm_name}</p>
        </div>
        <div className="text-right">
          <span className={`text-3xl font-bold ${GRADE_COLOR[data.grade] || "text-white"}`}>{data.grade}</span>
          <p className="text-xs text-slate-500">trade grade</p>
        </div>
      </div>

      <div className="flex gap-4 text-sm">
        <div className="flex-1">
          <p className="stat-label mb-1">Sends</p>
          {data.sends.map((p, i) => (
            <p key={i} className="text-red-400 text-xs">{p.name} <span className="text-slate-500">${p.salary.toFixed(1)}M</span></p>
          ))}
          {data.sends.length === 0 && <p className="text-slate-600 text-xs italic">nothing</p>}
        </div>
        <div className="flex-1">
          <p className="stat-label mb-1">Receives</p>
          {data.receives.map((p, i) => (
            <p key={i} className="text-court text-xs">{p.name} <span className="text-slate-500">${p.salary.toFixed(1)}M</span></p>
          ))}
          {data.receives.length === 0 && <p className="text-slate-600 text-xs italic">nothing</p>}
        </div>
      </div>

      <div className="border-t border-slate-800 pt-3">
        <p className="text-xs text-slate-500 mb-1 font-medium">GM Style</p>
        <p className="text-xs text-slate-300">{data.gm_style}</p>
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-1 font-medium">Tendencies</p>
        <ul className="space-y-1">
          {data.gm_tendencies.map((t, i) => (
            <li key={i} className="text-xs text-slate-400 flex gap-1.5">
              <span className="text-slate-600 mt-0.5">•</span>{t}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-1 font-medium">Fit Analysis</p>
        <div className="mb-2 h-1.5 rounded-full bg-slate-800">
          <div
            className="h-1.5 rounded-full bg-court transition-all"
            style={{ width: `${data.fit_score * 100}%` }}
          />
        </div>
        <ul className="space-y-1">
          {data.fit_reasons.map((r, i) => (
            <li key={i} className="text-xs text-slate-400 flex gap-1.5">
              <span className="text-slate-600 mt-0.5">•</span>{r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function TradeMachine() {
  const [teams, setTeams] = useState([]);
  const [sideA, setSideA] = useState({ team_abbr: "", team_name: "", sends: [] });
  const [sideB, setSideB] = useState({ team_abbr: "", team_name: "", sends: [] });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.tradeTeams().then(setTeams).catch(() => {});
  }, []);

  async function analyze(e) {
    e.preventDefault();
    if (!sideA.team_abbr || !sideB.team_abbr) {
      setError("Select both teams first.");
      return;
    }
    if (sideA.team_abbr === sideB.team_abbr) {
      setError("Teams must be different.");
      return;
    }
    if (sideA.sends.length === 0 && sideB.sends.length === 0) {
      setError("Add at least one player to the trade.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.analyzeTrade({ sides: [sideA, sideB] });
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
        <h1 className="text-3xl font-bold text-white">Trade Machine</h1>
        <p className="mt-1 text-slate-400">
          Realistic NBA trade analysis — GM personalities, CBA salary rules, player fit, and AI grading.
        </p>
      </header>

      <form onSubmit={analyze} className="space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <TeamPanel label="Team 1" teams={teams} side={sideA} onChange={setSideA} />

          <div className="flex items-center justify-center">
            <span className="text-slate-600 text-2xl font-light">⇌</span>
          </div>

          <TeamPanel label="Team 2" teams={teams} side={sideB} onChange={setSideB} />
        </div>

        <div className="flex justify-center">
          <button type="submit" disabled={loading} className="btn-primary px-8">
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Analyzing trade…
              </span>
            ) : "Analyze Trade"}
          </button>
        </div>
      </form>

      {error && <p className="text-amber-300 text-center">{error}</p>}

      {result && (
        <div className="space-y-5 animate-slide-up">
          {/* Header verdict */}
          <div className="card p-5 text-center space-y-2">
            <p className="text-slate-400 text-sm">
              {result.team_a.abbr} ⇌ {result.team_b.abbr}
            </p>
            <p className={`text-3xl font-bold ${LIKELIHOOD_COLOR[result.likelihood_label] || "text-white"}`}>
              {result.likelihood_label}
            </p>
            <p className="text-slate-400 text-sm">Trade likelihood</p>
            <div className="max-w-xs mx-auto mt-2 h-2 rounded-full bg-slate-800">
              <div
                className="h-2 rounded-full bg-court transition-all"
                style={{ width: `${result.trade_likelihood * 100}%` }}
              />
            </div>
          </div>

          {/* CBA check */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${result.salary_valid ? "bg-court" : "bg-red-500"}`} />
              <p className="font-semibold text-white text-sm">
                CBA Salary Matching — {result.salary_valid ? "Valid" : "Invalid"}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SalaryBar
                label={`${result.team_a.abbr} receives`}
                value={result.cba_check.team_a_receives}
                max={result.cba_check.team_a_max_receive}
                ok={result.cba_check.team_a_ok}
              />
              <SalaryBar
                label={`${result.team_b.abbr} receives`}
                value={result.cba_check.team_b_receives}
                max={result.cba_check.team_b_max_receive}
                ok={result.cba_check.team_b_ok}
              />
            </div>
            {!result.salary_valid && (
              <p className="text-xs text-red-400">
                Salary doesn't match CBA rules (125% + $100K rule). Trade cannot happen as structured.
              </p>
            )}
          </div>

          {/* Team breakdowns */}
          <div className="flex flex-col lg:flex-row gap-4">
            <TeamResult data={result.team_a} isA={true} />
            <TeamResult data={result.team_b} isA={false} />
          </div>

          {/* AI analysis */}
          {result.ai_summary && (
            <div className="card p-5 space-y-2">
              <p className="stat-label">AI Front Office Analysis</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{result.ai_summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
