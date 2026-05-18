import { useState } from "react";
import { api } from "../api.js";

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

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Players</h1>
        <p className="mt-1 text-slate-400">Search and view career summaries — shot charts in Phase 1</p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Results</h2>
          <ul className="space-y-1">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => loadProfile(p.id)}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-800"
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

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Profile</h2>
          {!profile && <p className="text-sm text-slate-500">Select a player.</p>}
          {profile?.info && (
            <div className="space-y-4">
              <div>
                <p className="text-xl font-bold text-white">{profile.info.DISPLAY_FIRST_LAST}</p>
                <p className="text-sm text-slate-400">
                  {profile.info.TEAM_NAME} · {profile.info.POSITION}
                </p>
              </div>
              {profile.recent_seasons?.length > 0 && (
                <div>
                  <p className="stat-label mb-2">Recent seasons (regular season)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-slate-500">
                          <th className="py-1 pr-3">Season</th>
                          <th className="py-1 pr-3">PTS</th>
                          <th className="py-1 pr-3">REB</th>
                          <th className="py-1">AST</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.recent_seasons.map((s) => (
                          <tr key={s.SEASON_ID} className="border-t border-slate-800 text-slate-300">
                            <td className="py-2 pr-3 font-mono">{s.SEASON_ID}</td>
                            <td className="py-2 pr-3 font-mono">{s.PTS}</td>
                            <td className="py-2 pr-3 font-mono">{s.REB}</td>
                            <td className="py-2 font-mono">{s.AST}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
