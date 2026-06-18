import { useState } from "react";
import { api } from "../api.js";

const BADGE_TIER_COLOR = {
  Gold: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  Silver: "text-slate-300 border-slate-400/30 bg-slate-400/10",
  Bronze: "text-orange-400 border-orange-500/30 bg-orange-500/10",
};

function BadgePill({ name, tier }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${BADGE_TIER_COLOR[tier] ?? "text-slate-400 border-slate-700"}`}>
      {tier} · {name}
    </span>
  );
}

function CompCard({ comp }) {
  const badgeEntries = Object.entries(comp.badges || {});
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-white">{comp.name}</p>
          <p className="text-xs text-slate-500">{comp.archetype}</p>
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-court-glow">{(comp.similarity * 100).toFixed(0)}%</p>
          <p className="text-xs text-slate-600">match · age {comp.matched_age}</p>
        </div>
      </div>
      {badgeEntries.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {badgeEntries.map(([name, tier]) => (
            <BadgePill key={name} name={name} tier={tier} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectionRow({ age, best, median, bust }) {
  return (
    <tr className="border-t border-slate-800">
      <td className="py-2 text-slate-400 font-mono">Age {age}</td>
      <td className="py-2 text-center font-mono text-court-glow">{best ?? "—"}</td>
      <td className="py-2 text-center font-mono text-blue-400">{median ?? "—"}</td>
      <td className="py-2 text-center font-mono text-red-400">{bust ?? "—"}</td>
    </tr>
  );
}

export default function PlayerTrajectory() {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function doSearch(q) {
    setSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const data = await api.searchPlayers(q);
      setSearchResults((data.players ?? data).slice(0, 8));
    } catch {}
  }

  async function analyze(pid, name) {
    setSearch(name);
    setSearchResults([]);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.playerTrajectory(pid);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const projAges = result
    ? Array.from(new Set([
        ...Object.keys(result.projections.best_case),
        ...Object.keys(result.projections.median),
        ...Object.keys(result.projections.bust),
      ])).map(Number).sort((a, b) => a - b)
    : [];

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Player Development Trajectory</h1>
        <p className="mt-1 text-slate-400">
          Finds historical comps and projects best-case / median / bust development curves.
        </p>
      </header>

      <div className="card max-w-xl p-6 space-y-3">
        <label className="block text-sm">
          <span className="stat-label">Search player (age 19–26 for best results)</span>
          <input
            type="text"
            value={search}
            onChange={e => doSearch(e.target.value)}
            placeholder="e.g. Anthony Edwards"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </label>
        {searchResults.length > 0 && (
          <div className="rounded border border-slate-700 bg-slate-900 divide-y divide-slate-800">
            {searchResults.map(p => (
              <button
                key={p.id}
                onClick={() => analyze(p.id, p.full_name)}
                className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
              >
                {p.full_name}
              </button>
            ))}
          </div>
        )}
        {loading && <p className="text-slate-400 text-sm">Fetching career data…</p>}
      </div>

      {error && <p className="text-amber-300">{error}</p>}

      {result && (
        <div className="space-y-5 animate-slide-up">
          <div>
            <h2 className="text-xl font-bold text-white">
              {result.player_name}
              <span className="ml-2 text-sm text-slate-500 font-normal">Age {result.current_age}</span>
            </h2>
            {result.archetype && (
              <p className="text-sm text-court-glow mt-0.5">{result.archetype}</p>
            )}
          </div>

          {/* This player's own badge profile */}
          {result.badges && Object.keys(result.badges).length > 0 && (
            <div className="card p-4">
              <p className="stat-label mb-2">Badge Profile</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(result.badges).map(([name, tier]) => (
                  <BadgePill key={name} name={name} tier={tier} />
                ))}
              </div>
            </div>
          )}

          {/* Historical scoring arc */}
          <div className="card p-4">
            <p className="stat-label mb-3">Historical PPG by Age</p>
            <div className="flex items-end gap-2 h-20">
              {result.historical.map(h => {
                const maxPts = Math.max(...result.historical.map(x => x.pts), 1);
                const height = `${(h.pts / maxPts) * 100}%`;
                return (
                  <div key={h.age} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-slate-500 font-mono">{h.pts}</span>
                    <div className="w-full bg-court rounded-t" style={{ height }} />
                    <span className="text-xs text-slate-600">{h.age}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comps */}
          <div>
            <p className="stat-label mb-3">Historical Comparables</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {result.comps.map((c, i) => <CompCard key={i} comp={c} rank={i + 1} />)}
            </div>
          </div>

          {/* Projection table */}
          {projAges.length > 0 && (
            <div className="card p-4">
              <p className="stat-label mb-3">PPG Projection (from age {result.current_age + 1})</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="pb-2 text-slate-600 font-normal">Age</th>
                    <th className="pb-2 text-court-glow font-normal text-center">Best Case</th>
                    <th className="pb-2 text-blue-400 font-normal text-center">Median</th>
                    <th className="pb-2 text-red-400 font-normal text-center">Bust</th>
                  </tr>
                </thead>
                <tbody>
                  {projAges.map(age => (
                    <ProjectionRow
                      key={age}
                      age={age}
                      best={result.projections.best_case[String(age)]}
                      median={result.projections.median[String(age)]}
                      bust={result.projections.bust[String(age)]}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-slate-600">
            Model: two-layer similarity (primary archetype + badge overlap) vs curated comp database · Data: NBA API + Basketball-Reference
          </p>
        </div>
      )}
    </div>
  );
}
