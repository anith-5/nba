import { useState } from "react";
import { api } from "../api.js";

function StatBox({ label, value, suffix = "" }) {
  return (
    <div className="rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2 text-center">
      <p className="text-lg font-bold font-mono text-white">{value}{suffix}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function Players() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function search(e) {
    e.preventDefault();
    if (query.length < 2) return;
    setLoading(true);
    setError(null);
    setProfile(null);
    try {
      const data = await api.searchPlayers(query);
      setResults(data.players || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadProfile(id) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.playerProfile(id);
      setProfile(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const c = profile?.career_totals;

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Players</h1>
        <p className="mt-1 text-slate-400">Search and view full career stat history</p>
      </header>

      <form onSubmit={search} className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player name…"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-white placeholder:text-slate-500 focus:border-court focus:outline-none"
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          Search
        </button>
      </form>

      {error && <p className="text-amber-300">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="card p-4 h-fit">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Results</h2>
          <ul className="space-y-1">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => loadProfile(p.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-800 ${
                    profile?.player_id === p.id ? "bg-court/10 text-court-glow" : "text-slate-300"
                  }`}
                >
                  {p.full_name}
                  {!p.is_active && <span className="ml-2 text-xs text-slate-500">inactive</span>}
                </button>
              </li>
            ))}
            {results.length === 0 && !loading && (
              <p className="text-sm text-slate-500">Search for a player to begin.</p>
            )}
          </ul>
        </div>

        <div className="space-y-4">
          {!profile && (
            <div className="card p-6 text-center text-slate-500">Select a player to view career stats.</div>
          )}

          {profile?.info && (
            <>
              {/* Header */}
              <div className="card p-5">
                <p className="text-2xl font-bold text-white">{profile.info.DISPLAY_FIRST_LAST}</p>
                <p className="text-sm text-slate-400 mt-0.5">
                  {profile.info.TEAM_NAME || "Free Agent"} · {profile.info.POSITION} ·{" "}
                  {profile.info.HEIGHT} · {profile.info.WEIGHT} lbs
                </p>
              </div>

              {/* Career averages */}
              {c && (
                <div className="card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="stat-label">Career Averages</p>
                    <span className="text-xs text-slate-500">{c.gp} games played</span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    <StatBox label="PPG" value={c.ppg} />
                    <StatBox label="RPG" value={c.rpg} />
                    <StatBox label="APG" value={c.apg} />
                    <StatBox label="SPG" value={c.spg} />
                    <StatBox label="BPG" value={c.bpg} />
                    <StatBox label="MPG" value={c.min_pg} />
                    <StatBox label="FG%" value={(c.fg_pct * 100).toFixed(1)} suffix="%" />
                    <StatBox label="3P%" value={(c.fg3_pct * 100).toFixed(1)} suffix="%" />
                    <StatBox label="FT%" value={(c.ft_pct * 100).toFixed(1)} suffix="%" />
                    <StatBox label="eFG%" value={(c.efg_pct * 100).toFixed(1)} suffix="%" />
                    <StatBox label="TS%" value={(c.ts_pct * 100).toFixed(1)} suffix="%" />
                    <StatBox label="TOPG" value={c.topg} />
                  </div>
                </div>
              )}

              {/* Full season-by-season table */}
              {profile.seasons?.length > 0 && (
                <div className="card p-5">
                  <p className="stat-label mb-3">
                    Season-by-Season ({profile.seasons.length} season{profile.seasons.length !== 1 ? "s" : ""})
                  </p>
                  <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-900">
                        <tr className="text-slate-500">
                          <th className="py-1.5 pr-3">Season</th>
                          <th className="py-1.5 pr-3">Team</th>
                          <th className="py-1.5 pr-3">Age</th>
                          <th className="py-1.5 pr-3">GP</th>
                          <th className="py-1.5 pr-3">MIN</th>
                          <th className="py-1.5 pr-3">PPG</th>
                          <th className="py-1.5 pr-3">RPG</th>
                          <th className="py-1.5 pr-3">APG</th>
                          <th className="py-1.5 pr-3">SPG</th>
                          <th className="py-1.5 pr-3">BPG</th>
                          <th className="py-1.5 pr-3">FG%</th>
                          <th className="py-1.5 pr-3">3P%</th>
                          <th className="py-1.5 pr-3">FT%</th>
                          <th className="py-1.5">TS%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.seasons.map((s, i) => (
                          <tr key={`${s.season}-${i}`} className="border-t border-slate-800 text-slate-300 hover:bg-slate-800/40">
                            <td className="py-1.5 pr-3 font-mono">{s.season}</td>
                            <td className="py-1.5 pr-3">{s.team}</td>
                            <td className="py-1.5 pr-3 font-mono">{s.age}</td>
                            <td className="py-1.5 pr-3 font-mono">{s.gp}</td>
                            <td className="py-1.5 pr-3 font-mono">{s.min_pg}</td>
                            <td className="py-1.5 pr-3 font-mono text-white">{s.ppg}</td>
                            <td className="py-1.5 pr-3 font-mono">{s.rpg}</td>
                            <td className="py-1.5 pr-3 font-mono">{s.apg}</td>
                            <td className="py-1.5 pr-3 font-mono">{s.spg}</td>
                            <td className="py-1.5 pr-3 font-mono">{s.bpg}</td>
                            <td className="py-1.5 pr-3 font-mono">{(s.fg_pct * 100).toFixed(1)}%</td>
                            <td className="py-1.5 pr-3 font-mono">{(s.fg3_pct * 100).toFixed(1)}%</td>
                            <td className="py-1.5 pr-3 font-mono">{(s.ft_pct * 100).toFixed(1)}%</td>
                            <td className="py-1.5 font-mono">{(s.ts_pct * 100).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
