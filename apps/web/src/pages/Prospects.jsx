import { useState, useEffect } from "react";
import { api } from "../api.js";

const IQ_COLOR = (score) =>
  score >= 80 ? "text-court-glow" : score >= 70 ? "text-blue-400" : score >= 60 ? "text-slate-300" : "text-orange-400";

function ProspectCard({ p, onClick }) {
  return (
    <div
      onClick={() => onClick(p)}
      className="card-hover p-4 cursor-pointer space-y-3"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-white">{p.name}</p>
          <p className="text-xs text-slate-500">{p.position} · {p.age} yrs · {p.nationality}</p>
        </div>
        <div className="text-right">
          <p className={`font-mono font-bold text-xl ${IQ_COLOR(p.hoop_iq_score)}`}>{p.hoop_iq_score}</p>
          <p className="text-xs text-slate-600">HoopIQ Score</p>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">{p.league}</span>
        <span className="text-xs px-2 py-0.5 rounded bg-court/10 text-court border border-court/20">{p.nba_archetype}</span>
      </div>
      <p className="text-xs text-slate-400">Draft: {p.draft_range}</p>
      <div className="grid grid-cols-4 gap-2 text-center text-xs border-t border-slate-800 pt-2">
        {[["PPG", p.stats.ppg], ["RPG", p.stats.rpg], ["APG", p.stats.apg], ["3P%", `${(p.stats.fg3_pct * 100).toFixed(0)}%`]].map(([l, v]) => (
          <div key={l}><p className="text-slate-600">{l}</p><p className="font-mono text-white">{v}</p></div>
        ))}
      </div>
    </div>
  );
}

function ProspectDetail({ p, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">{p.name}</h2>
            <p className="text-slate-400">{p.position} · {p.team} · {p.league}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-4xl font-bold font-mono ${IQ_COLOR(p.hoop_iq_score)}`}>{p.hoop_iq_score}</span>
          <div>
            <p className="text-slate-400 text-sm">HoopIQ Score</p>
            <p className="text-xs text-slate-600">{p.draft_range} · {p.status}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {[["Age", p.age], ["Height", p.height], ["Weight", p.weight], ["Nationality", p.nationality]].map(([k, v]) => (
            <div key={k} className="card p-2"><p className="stat-label">{k}</p><p className="text-white font-mono">{v}</p></div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-sm border-y border-slate-800 py-3">
          {[["PPG", p.stats.ppg], ["RPG", p.stats.rpg], ["APG", p.stats.apg], ["FG%", `${(p.stats.fg_pct * 100).toFixed(0)}%`], ["3P%", `${(p.stats.fg3_pct * 100).toFixed(0)}%`], ["SPG", p.stats.spg]].map(([l, v]) => (
            <div key={l}><p className="stat-label">{l}</p><p className="font-mono text-white">{v}</p></div>
          ))}
        </div>

        <div>
          <p className="stat-label mb-2">NBA Archetype</p>
          <p className="text-court text-sm font-medium">{p.nba_archetype}</p>
          <p className="text-xs text-slate-500 mt-1">Comparable: {p.comparable}</p>
        </div>

        <div>
          <p className="stat-label mb-2">Best System Fits</p>
          <div className="flex flex-wrap gap-2">
            {p.fit_archetypes.map(a => (
              <span key={a} className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">{a}</span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="stat-label mb-2 text-court">Strengths</p>
            {p.strengths.map((s, i) => <p key={i} className="text-slate-300 text-xs py-0.5">✓ {s}</p>)}
          </div>
          <div>
            <p className="stat-label mb-2 text-red-400">Concerns</p>
            {p.concerns.map((c, i) => <p key={i} className="text-slate-400 text-xs py-0.5">⚠ {c}</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Prospects() {
  const [prospects, setProspects] = useState([]);
  const [filters, setFilters] = useState({});
  const [archetypeFilter, setArchetypeFilter] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.prospects().then(d => {
      setProspects(d.prospects);
      setFilters(d.filters);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = prospects.filter(p =>
    (!archetypeFilter || p.nba_archetype === archetypeFilter) &&
    (!leagueFilter || p.league === leagueFilter)
  ).sort((a, b) => b.hoop_iq_score - a.hoop_iq_score);

  return (
    <div className="animate-fade-in space-y-6">
      {selected && <ProspectDetail p={selected} onClose={() => setSelected(null)} />}

      <header>
        <h1 className="text-3xl font-bold text-white">International Prospect Radar</h1>
        <p className="mt-1 text-slate-400">
          EuroLeague · ACB · NBL scouting with NBA archetype mapping — the free alternative to SkillCorner.
        </p>
      </header>

      <div className="flex gap-3 flex-wrap">
        <select
          value={archetypeFilter}
          onChange={e => setArchetypeFilter(e.target.value)}
          className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">All archetypes</option>
          {(filters.archetypes ?? []).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={leagueFilter}
          onChange={e => setLeagueFilter(e.target.value)}
          className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">All leagues</option>
          {(filters.leagues ?? []).map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <span className="flex items-center text-xs text-slate-600 px-2">
          {filtered.length} prospect{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading prospects…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => <ProspectCard key={p.slug} p={p} onClick={setSelected} />)}
        </div>
      )}

      <p className="text-xs text-slate-600">
        Demo dataset — production integrates SkillCorner / Synergy International data. Click any card for full profile.
      </p>
    </div>
  );
}
