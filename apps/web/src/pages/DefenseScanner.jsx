import { useState, useEffect } from "react";
import { api } from "../api.js";

const SEVERITY_STYLE = {
  Critical:    "text-red-400 bg-red-500/10 border-red-500/30",
  Exploitable: "text-orange-400 bg-orange-500/10 border-orange-500/30",
};
const STRENGTH_STYLE = "text-court-glow bg-court/10 border-court/30";
const RANK_COLOR = (r) =>
  r <= 5 ? "text-court-glow" : r <= 15 ? "text-yellow-400" : r <= 25 ? "text-orange-400" : "text-red-400";

// ── Shared: vulnerability card with exploitation tactics ──────────────────────

function VulnCard({ item }) {
  const [open, setOpen] = useState(false);
  const cls = SEVERITY_STYLE[item.severity] ?? SEVERITY_STYLE["Exploitable"];
  const exploit = item.how_to_exploit;
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${cls}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{item.metric}</p>
          <p className="text-xs font-mono mt-0.5">
            {item.value.toFixed ? (item.value * (item.metric.includes("%") ? 100 : 1)).toFixed(item.metric.includes("%") ? 1 : 1) : item.value}
            {item.metric.includes("%") ? "%" : ""} vs lg avg {(item.league_avg * (item.metric.includes("%") ? 100 : 1)).toFixed(1)}{item.metric.includes("%") ? "%" : ""}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-xs px-1.5 py-0.5 rounded bg-black/20">{item.severity}</span>
          <p className="text-xs mt-1 font-mono">{item.pct_above_avg > 0 ? "+" : ""}{item.pct_above_avg}%</p>
        </div>
      </div>

      {exploit && (
        <>
          <p className="text-xs opacity-90 leading-snug">{exploit.tip}</p>
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
          >
            {open ? "Hide tactics ▲" : "How to exploit ▼"}
          </button>
          {open && (
            <ul className="space-y-1 mt-1">
              {exploit.actions.map((a, i) => (
                <li key={i} className="text-xs opacity-80 flex items-start gap-1.5">
                  <span className="mt-0.5 flex-shrink-0">→</span>{a}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function OffensivePlan({ plan, aiPlan }) {
  if (!plan) return null;
  return (
    <div className="card p-4 space-y-3 border-court/20">
      <p className="stat-label text-court-glow">Offensive Game Plan</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-3">
          <p className="text-xs font-semibold text-slate-400 mb-1">⏱ Tempo</p>
          <p className="text-sm text-slate-200 leading-snug">{plan.tempo}</p>
        </div>
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-3">
          <p className="text-xs font-semibold text-slate-400 mb-1">🎯 Shot Profile</p>
          <p className="text-sm text-slate-200 leading-snug">{plan.shot_profile}</p>
        </div>
      </div>

      {plan.primary_attack && (
        <div className="rounded-lg bg-court/5 border border-court/20 p-3">
          <p className="text-xs font-semibold text-court-glow mb-1">
            Primary Attack — {plan.primary_attack.target}
          </p>
          <p className="text-sm text-slate-300 leading-snug mb-1.5">{plan.primary_attack.why}</p>
          <ul className="space-y-0.5">
            {plan.primary_attack.actions.map((a, i) => (
              <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                <span className="text-court mt-0.5">→</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.secondary_attack && (
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-3">
          <p className="text-xs font-semibold text-slate-300 mb-1">
            Secondary Attack — {plan.secondary_attack.target}
          </p>
          <p className="text-sm text-slate-400 leading-snug mb-1.5">{plan.secondary_attack.why}</p>
          <ul className="space-y-0.5">
            {plan.secondary_attack.actions.map((a, i) => (
              <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5">
                <span className="text-slate-500 mt-0.5">→</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3">
        <p className="text-xs font-semibold text-red-400 mb-1">⛔ Avoid</p>
        <p className="text-sm text-slate-300 leading-snug">{plan.avoid}</p>
      </div>

      {aiPlan && (
        <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
          <p className="text-xs font-semibold text-blue-400 mb-1.5">🤖 AI Coach's Plan</p>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{aiPlan}</p>
        </div>
      )}
    </div>
  );
}

function StrengthCard({ item }) {
  return (
    <div className={`rounded-lg border p-3 space-y-1 ${STRENGTH_STYLE}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{item.metric}</p>
        <span className="text-xs px-1.5 py-0.5 rounded bg-black/20">{item.advantage}</span>
      </div>
      <p className="text-xs font-mono">
        {(item.value * (item.metric.includes("%") ? 100 : 1)).toFixed(1)}{item.metric.includes("%") ? "%" : ""}
        <span className="text-slate-500 ml-1">({item.pct_above_avg > 0 ? "+" : ""}{item.pct_above_avg}% vs avg)</span>
      </p>
      {item.warning && (
        <p className="text-xs opacity-80 leading-snug border-t border-current/20 pt-1 mt-1">
          ⚠ {item.warning}
        </p>
      )}
    </div>
  );
}

// ── Single team scanner ───────────────────────────────────────────────────────

function TeamScanner({ teams }) {
  const [teamId, setTeamId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function scan() {
    if (!teamId) return;
    setLoading(true); setError(null); setResult(null);
    try {
      setResult(await api.defenseVulnerabilities(Number(teamId)));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div className="card max-w-lg p-5 flex gap-4 items-end">
        <label className="flex-1 block text-sm">
          <span className="stat-label">Select team to scout</span>
          <select value={teamId} onChange={e => setTeamId(e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white">
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
          {/* Header */}
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-xl font-bold text-white">{result.team_name}</h2>
            <div className="flex gap-3 flex-wrap">
              <div className="card px-3 py-1.5 text-sm">
                Def Rank: <span className={`font-mono font-bold ${RANK_COLOR(result.defensive_rank)}`}>
                  #{result.defensive_rank}
                </span>
                <span className="text-slate-600 text-xs ml-1">/ 30</span>
              </div>
              {result.def_rating != null && (
                <div className="card px-3 py-1.5 text-sm">
                  Def Rating: <span className="font-mono font-bold text-white">{result.def_rating}</span>
                  <span className="text-slate-600 text-xs ml-1">pts/100</span>
                </div>
              )}
              {result.pace != null && (
                <div className="card px-3 py-1.5 text-sm">
                  Pace: <span className="font-mono font-bold text-white">{result.pace}</span>
                </div>
              )}
              <div className="card px-3 py-1.5 text-sm">
                Opp PPG: <span className="font-mono font-bold text-white">{result.opp_pts_per_game}</span>
              </div>
            </div>
          </div>

          {/* Offensive game plan */}
          <OffensivePlan plan={result.offensive_plan} aiPlan={result.ai_game_plan} />

          {/* Vulnerabilities */}
          {result.vulnerabilities.length > 0 && (
            <div>
              <p className="stat-label mb-3">Vulnerabilities — Expand for Tactics</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {result.vulnerabilities.map((v, i) => <VulnCard key={i} item={v} />)}
              </div>
            </div>
          )}

          {/* Strengths */}
          {result.strengths.length > 0 && (
            <div>
              <p className="stat-label mb-3">Defensive Strengths — Avoid These</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {result.strengths.map((s, i) => <StrengthCard key={i} item={s} />)}
              </div>
            </div>
          )}

          {result.vulnerabilities.length === 0 && result.strengths.length === 0 && (
            <div className="card p-5 text-slate-400">
              This team is close to league average across all defensive metrics — no standout vulnerabilities or strengths.
            </div>
          )}

          <p className="text-xs text-slate-600">Season: {result.season} · Rank = position by opp PPG allowed (1 = fewest points allowed)</p>
        </div>
      )}
    </div>
  );
}

// ── League overview ───────────────────────────────────────────────────────────

function LeagueRow({ team, onClick }) {
  const vulnCount = team.vulnerabilities.length;
  const topVuln = team.vulnerabilities[0];
  return (
    <tr
      onClick={() => onClick(team)}
      className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer transition-colors"
    >
      <td className="py-2 px-3">
        <span className={`font-mono font-bold text-sm ${RANK_COLOR(team.defensive_rank)}`}>
          #{team.defensive_rank}
        </span>
      </td>
      <td className="py-2 px-3">
        <p className="text-sm text-white font-medium">{team.team_name}</p>
        <p className="text-xs text-slate-500">{team.abbreviation}</p>
      </td>
      <td className="py-2 px-3 font-mono text-sm text-center text-white">
        {team.opp_pts_per_game}
      </td>
      <td className="py-2 px-3">
        {topVuln ? (
          <span className={`text-xs px-2 py-0.5 rounded border ${SEVERITY_STYLE[topVuln.severity] ?? ""}`}>
            {topVuln.metric} ({topVuln.pct_above_avg > 0 ? "+" : ""}{topVuln.pct_above_avg}%)
          </span>
        ) : (
          <span className="text-xs text-slate-600">No major vulnerability</span>
        )}
      </td>
      <td className="py-2 px-3 text-center">
        <span className={`text-xs font-mono ${vulnCount > 2 ? "text-red-400" : vulnCount > 0 ? "text-orange-400" : "text-court-glow"}`}>
          {vulnCount}
        </span>
      </td>
      <td className="py-2 px-3 text-right">
        <span className="text-xs text-slate-600">→</span>
      </td>
    </tr>
  );
}

function LeagueOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filterVulnOnly, setFilterVulnOnly] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      setData(await api.defenseLeague());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const teams = data?.teams ?? [];
  const filtered = filterVulnOnly ? teams.filter(t => t.vulnerabilities.length > 0) : teams;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={load} disabled={loading} className="btn-primary">
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Loading all 30 teams…
            </span>
          ) : data ? "↻ Refresh" : "Load League Rankings"}
        </button>
        {data && (
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input type="checkbox" checked={filterVulnOnly} onChange={e => setFilterVulnOnly(e.target.checked)}
              className="accent-court" />
            Show only teams with vulnerabilities
          </label>
        )}
      </div>

      {error && <p className="text-amber-300">{error}</p>}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setSelected(null)}>
          <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{selected.team_name}</h2>
                <p className="text-slate-500 text-sm">
                  Defensive Rank #{selected.defensive_rank}
                  {selected.def_rating != null && ` · ${selected.def_rating} DEF RTG`}
                  {selected.pace != null && ` · ${selected.pace} pace`}
                  {` · ${selected.opp_pts_per_game} OPP PPG`}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white text-2xl">×</button>
            </div>

            <OffensivePlan plan={selected.offensive_plan} aiPlan={selected.ai_game_plan} />

            {selected.vulnerabilities.length > 0 && (
              <div>
                <p className="stat-label mb-3">Vulnerabilities</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {selected.vulnerabilities.map((v, i) => <VulnCard key={i} item={v} />)}
                </div>
              </div>
            )}

            {selected.strengths.length > 0 && (
              <div>
                <p className="stat-label mb-3">Strengths — Avoid These</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {selected.strengths.map((s, i) => <StrengthCard key={i} item={s} />)}
                </div>
              </div>
            )}

            {selected.vulnerabilities.length === 0 && selected.strengths.length === 0 && (
              <p className="text-slate-400">Close to league average — no standout vulnerabilities or strengths.</p>
            )}
          </div>
        </div>
      )}

      {data && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">All 30 Teams — Defensive Rankings</p>
            <p className="text-xs text-slate-600">{data.season} · Click any row for full breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-800">
                  <th className="px-3 py-2 text-slate-600 font-normal text-xs">Rank</th>
                  <th className="px-3 py-2 text-slate-600 font-normal text-xs">Team</th>
                  <th className="px-3 py-2 text-slate-600 font-normal text-xs text-center">Opp PPG</th>
                  <th className="px-3 py-2 text-slate-600 font-normal text-xs">Top Vulnerability</th>
                  <th className="px-3 py-2 text-slate-600 font-normal text-xs text-center">Vulns</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => <LeagueRow key={t.team_id} team={t} onClick={setSelected} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DefenseScanner() {
  const [teams, setTeams] = useState([]);
  const [tab, setTab] = useState("team");

  useEffect(() => {
    api.defenseTeams().then(setTeams).catch(() => {});
  }, []);

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Defensive Scheme Scanner</h1>
        <p className="mt-1 text-slate-400">
          Exploitable weaknesses with tactical game plans — single team or all 30 at once.
        </p>
      </header>

      <div className="flex gap-1 p-1 rounded-lg bg-slate-900 w-fit">
        {[["team", "🔍 Single Team"], ["league", "🏆 All 30 Teams"]].map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === v ? "bg-court text-slate-950" : "text-slate-400 hover:text-white"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "team"   && <TeamScanner teams={teams} />}
      {tab === "league" && <LeagueOverview />}
    </div>
  );
}
