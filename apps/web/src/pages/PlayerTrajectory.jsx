import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";

const BADGE_TIER_COLOR = {
  Gold: "text-terracotta border-terracotta/30 bg-terracotta/10",
  Silver: "text-ink border-ink/20 bg-ink/10",
  Bronze: "text-ink/60 border-ink/10 bg-ink/[0.04]",
};

function BadgePill({ name, tier }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${BADGE_TIER_COLOR[tier] ?? "text-ink/70 border-ink/20"}`}>
      {tier} · {name}
    </span>
  );
}

function CompCard({ comp }) {
  const badgeEntries = Object.entries(comp.badges || {});
  return (
    <div className="hoop-card-outline p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-ink">{comp.name}</p>
          <p className="text-xs text-ink/60">{comp.archetype}</p>
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-terracotta">{(comp.similarity * 100).toFixed(0)}%</p>
          <p className="text-xs text-ink/50">match · age {comp.matched_age}</p>
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
    <tr className="border-t border-ink/15">
      <td className="py-2 text-ink/70 font-mono">Age {age}</td>
      <td className="py-2 text-center font-mono text-terracotta">{best ?? "—"}</td>
      <td className="py-2 text-center font-mono text-ink">{median ?? "—"}</td>
      <td className="py-2 text-center font-mono text-stat-down">{bust ?? "—"}</td>
    </tr>
  );
}

export default function PlayerTrajectory() {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [params] = useSearchParams();
  const preRef = useRef(false);

  // Pre-load from ?player=id&name=… (player-profile quick action)
  useEffect(() => {
    const pid = params.get("player");
    const name = params.get("name") || "";
    if (pid && !preRef.current) {
      preRef.current = true;
      analyze(pid, name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

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
        <h1 className="text-3xl font-bold text-ink">Player Development Trajectory</h1>
        <p className="mt-1 text-ink/70">
          Finds historical comps and projects best-case / median / bust development curves.
        </p>
      </header>

      <div className="hoop-card-outline max-w-xl p-6 space-y-3">
        <label className="block text-sm">
          <span className="hoop-stat-label">Search player (age 19–26 for best results)</span>
          <input
            type="text"
            value={search}
            onChange={e => doSearch(e.target.value)}
            placeholder="e.g. Anthony Edwards"
            className="mt-1 w-full rounded-xl border-2 border-ink bg-paper shadow-hoop-sm px-3 py-2 text-ink"
          />
        </label>
        {searchResults.length > 0 && (
          <div className="rounded-xl border-2 border-ink bg-paper shadow-hoop-sm divide-y divide-ink/15">
            {searchResults.map(p => (
              <button
                key={p.id}
                onClick={() => analyze(p.id, p.full_name)}
                className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-ink/5"
              >
                {p.full_name}
              </button>
            ))}
          </div>
        )}
        {loading && <p className="text-ink/70 text-sm">Fetching career data…</p>}
      </div>

      {error && <p className="text-stat-down">{error}</p>}

      {result && (
        <div className="space-y-5 animate-slide-up">
          <div>
            <h2 className="text-xl font-bold text-ink">
              {result.player_name}
              <span className="ml-2 text-sm text-ink/60 font-normal">Age {result.current_age}</span>
            </h2>
            {result.archetype && (
              <p className="text-sm text-terracotta mt-0.5">{result.archetype}</p>
            )}
          </div>

          {/* This player's own badge profile */}
          {result.badges && Object.keys(result.badges).length > 0 && (
            <div className="hoop-card-outline p-4">
              <p className="hoop-stat-label mb-2">Badge Profile</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(result.badges).map(([name, tier]) => (
                  <BadgePill key={name} name={name} tier={tier} />
                ))}
              </div>
            </div>
          )}

          {/* Historical scoring arc */}
          <div className="hoop-card-outline p-4">
            <p className="hoop-stat-label mb-3">Historical PPG by Age</p>
            <div className="flex items-end gap-2 h-20">
              {result.historical.map(h => {
                const maxPts = Math.max(...result.historical.map(x => x.pts), 1);
                const height = `${(h.pts / maxPts) * 100}%`;
                return (
                  <div key={h.age} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-ink/60 font-mono">{h.pts}</span>
                    <div className="w-full bg-terracotta rounded-t" style={{ height }} />
                    <span className="text-xs text-ink/50">{h.age}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comps */}
          <div>
            <p className="hoop-stat-label mb-3">Historical Comparables</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {result.comps.map((c, i) => <CompCard key={i} comp={c} rank={i + 1} />)}
            </div>
          </div>

          {/* Projection table */}
          {projAges.length > 0 && (
            <div className="hoop-card-outline p-4">
              <p className="hoop-stat-label mb-3">PPG Projection (from age {result.current_age + 1})</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="pb-2 text-ink/50 font-normal">Age</th>
                    <th className="pb-2 text-terracotta font-normal text-center">Best Case</th>
                    <th className="pb-2 text-ink/70 font-normal text-center">Median</th>
                    <th className="pb-2 text-stat-down font-normal text-center">Bust</th>
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

          <p className="text-xs text-ink/50">
            Model: two-layer similarity (primary archetype + badge overlap) vs curated comp database · Data: NBA API + Basketball-Reference
          </p>
        </div>
      )}
    </div>
  );
}
