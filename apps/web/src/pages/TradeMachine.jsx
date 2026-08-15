import { useState, useEffect, useRef } from "react";
import { api } from "../api.js";

// Five-step scales, kept genuinely five-step. On the legacy dark theme the
// top two bands were white vs light-grey and the bottom two were bright-red
// vs red — distinctions that survive on black but not on paper, where they
// flatten into one colour. Anchoring the ends to the stat pair keeps an A
// visibly different from a B and a D from an F.
const GRADE_COLOR = {
  "A+": "text-stat-up", "A": "text-stat-up", "A-": "text-stat-up",
  "B+": "text-ink", "B": "text-ink", "B-": "text-ink",
  "C+": "text-ink/70", "C": "text-ink/70", "C-": "text-ink/70",
  "D+": "text-basketball-dim", "D": "text-basketball-dim",
  "F": "text-stat-down",
};

const LIKELIHOOD_COLOR = {
  "Very Likely": "text-stat-up",
  "Likely": "text-ink",
  "Possible": "text-ink/70",
  "Unlikely": "text-basketball-dim",
  "Very Unlikely": "text-stat-down",
};

// Team roster picker: shows this team's players (with salaries), filtered by a
// search box that only searches within the selected team.
function RosterPicker({ teamAbbr, selectedNames, onAdd }) {
  const [roster, setRoster] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!teamAbbr) { setRoster([]); return; }
    setLoading(true);
    setError(null);
    setQuery("");
    api
      .tradeRoster(teamAbbr)
      .then((d) => setRoster(d.players || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [teamAbbr]);

  const q = query.trim().toLowerCase();
  const filtered = q ? roster.filter((p) => p.name.toLowerCase().includes(q)) : roster;

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${teamAbbr} roster…`}
        className="w-full rounded-xl border-2 border-ink bg-paper shadow-hoop-sm px-3 py-2 text-sm text-ink placeholder-slate-500"
      />
      {loading && <p className="text-xs text-ink/60">Loading roster…</p>}
      {error && <p className="text-xs text-stat-down">{error}</p>}
      {!loading && !error && (
        <div className="max-h-64 overflow-y-auto rounded border border-ink/15 divide-y divide-ink/15">
          {filtered.map((p) => {
            const picked = selectedNames.includes(p.name);
            return (
              <button
                key={p.player_id}
                onClick={() => onAdd(p)}
                disabled={picked}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition ${
                  picked ? "opacity-40 cursor-default" : "hover:bg-ink/5"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{p.name}</span>
                  <span className="text-[11px] text-ink/60">{p.pts} PPG · {p.reb} RPG · {p.ast} APG</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm text-terracotta">
                    {p.salary_millions != null ? `$${p.salary_millions.toFixed(1)}M` : "—"}
                  </span>
                  {picked && <span className="text-[10px] text-ink/60">added</span>}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-3 text-xs text-ink/50">No players match.</p>
          )}
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
    <div className="hoop-card-outline p-5 space-y-4 flex-1">
      <p className="hoop-stat-label">{label}</p>

      <select
        value={side.team_abbr}
        onChange={e => setTeam(e.target.value)}
        className="w-full rounded-xl border-2 border-ink bg-paper shadow-hoop-sm px-3 py-2 text-sm text-ink"
      >
        <option value="">— Select team —</option>
        {teams.map(t => (
          <option key={t.abbreviation} value={t.abbreviation}>{t.name}</option>
        ))}
      </select>

      {side.team_abbr && (
        <>
          <div>
            <p className="text-xs text-ink/60 mb-2">Tap players to send out from {side.team_abbr}</p>
            <RosterPicker
              teamAbbr={side.team_abbr}
              selectedNames={side.sends.map((p) => p.name)}
              onAdd={addPlayer}
            />
          </div>

          {side.sends.length > 0 && (
            <div className="space-y-2">
              {side.sends.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-ink flex-1 truncate">{p.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-ink/60">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={p.salary_millions}
                      onChange={e => updateSalary(i, e.target.value)}
                      className="w-16 rounded-xl border-2 border-ink bg-paper shadow-hoop-sm px-2 py-1 text-xs font-mono text-ink"
                    />
                    <span className="text-xs text-ink/60">M</span>
                  </div>
                  <button onClick={() => removePlayer(i)} className="text-ink/50 hover:text-stat-down text-xs">✕</button>
                </div>
              ))}
              <p className="text-xs text-ink/60 text-right">
                Total outgoing: <span className="font-mono text-ink">${totalSalary.toFixed(1)}M</span>
              </p>
            </div>
          )}

          {side.sends.length === 0 && (
            <p className="text-xs text-ink/50 italic">No players added yet</p>
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
        <span className="text-ink/70">{label}</span>
        <span className={`font-mono ${ok ? "text-stat-up" : "text-stat-down"}`}>
          ${value.toFixed(1)}M / ${max.toFixed(1)}M max
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-ink/5">
        <div
          className={`h-1.5 rounded-full transition-all ${ok ? "bg-terracotta" : "bg-stat-down"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TeamResult({ data, isA }) {
  return (
    <div className="hoop-card-outline p-5 space-y-4 flex-1">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-lg font-bold text-ink">{data.team}</p>
          <p className="text-xs text-ink/60">GM: {data.gm_name}</p>
        </div>
        <div className="text-right">
          <span className={`text-3xl font-bold ${GRADE_COLOR[data.grade] || "text-ink"}`}>{data.grade}</span>
          <p className="text-xs text-ink/60">trade grade</p>
        </div>
      </div>

      <div className="flex gap-4 text-sm">
        <div className="flex-1">
          <p className="hoop-stat-label mb-1">Sends</p>
          {data.sends.map((p, i) => (
            <p key={i} className="text-stat-down text-xs">{p.name} <span className="text-ink/60">${p.salary.toFixed(1)}M</span></p>
          ))}
          {data.sends.length === 0 && <p className="text-ink/50 text-xs italic">nothing</p>}
        </div>
        <div className="flex-1">
          <p className="hoop-stat-label mb-1">Receives</p>
          {data.receives.map((p, i) => (
            <p key={i} className="text-terracotta text-xs">{p.name} <span className="text-ink/60">${p.salary.toFixed(1)}M</span></p>
          ))}
          {data.receives.length === 0 && <p className="text-ink/50 text-xs italic">nothing</p>}
        </div>
      </div>

      <div className="border-t border-ink/15 pt-3">
        <p className="text-xs text-ink/60 mb-1 font-medium">GM Style</p>
        <p className="text-xs text-ink">{data.gm_style}</p>
      </div>

      <div>
        <p className="text-xs text-ink/60 mb-1 font-medium">Tendencies</p>
        <ul className="space-y-1">
          {data.gm_tendencies.map((t, i) => (
            <li key={i} className="text-xs text-ink/70 flex gap-1.5">
              <span className="text-ink/50 mt-0.5">•</span>{t}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs text-ink/60 mb-1 font-medium">Fit Analysis</p>
        <div className="mb-2 h-1.5 rounded-full bg-ink/5">
          <div
            className="h-1.5 rounded-full bg-terracotta transition-all"
            style={{ width: `${data.fit_score * 100}%` }}
          />
        </div>
        <ul className="space-y-1">
          {data.fit_reasons.map((r, i) => (
            <li key={i} className="text-xs text-ink/70 flex gap-1.5">
              <span className="text-ink/50 mt-0.5">•</span>{r}
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
        <h1 className="text-3xl font-bold text-ink">Trade Machine</h1>
        <p className="mt-1 text-ink/70">
          Realistic NBA trade analysis — GM personalities, CBA salary rules, player fit, and AI grading.
        </p>
      </header>

      <form onSubmit={analyze} className="space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <TeamPanel label="Team 1" teams={teams} side={sideA} onChange={setSideA} />

          <div className="flex items-center justify-center">
            <span className="text-ink/50 text-2xl font-light">⇌</span>
          </div>

          <TeamPanel label="Team 2" teams={teams} side={sideB} onChange={setSideB} />
        </div>

        <div className="flex justify-center">
          <button type="submit" disabled={loading} className="hoop-btn-primary px-8">
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

      {error && <p className="text-stat-down text-center">{error}</p>}

      {result && (
        <div className="space-y-5 animate-slide-up">
          {/* Header verdict */}
          <div className="hoop-card-outline p-5 text-center space-y-2">
            <p className="text-ink/70 text-sm">
              {result.team_a.abbr} ⇌ {result.team_b.abbr}
            </p>
            <p className={`text-3xl font-bold ${LIKELIHOOD_COLOR[result.likelihood_label] || "text-ink"}`}>
              {result.likelihood_label}
            </p>
            <p className="text-ink/70 text-sm">Trade likelihood</p>
            <div className="max-w-xs mx-auto mt-2 h-2 rounded-full bg-ink/5">
              <div
                className="h-2 rounded-full bg-terracotta transition-all"
                style={{ width: `${result.trade_likelihood * 100}%` }}
              />
            </div>
          </div>

          {/* CBA check */}
          <div className="hoop-card-outline p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${result.salary_valid ? "bg-terracotta" : "bg-stat-down"}`} />
              <p className="font-semibold text-ink text-sm">
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
              <p className="text-xs text-stat-down">
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
            <div className="hoop-card-outline p-5 space-y-2">
              <p className="hoop-stat-label">AI Front Office Analysis</p>
              <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{result.ai_summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
