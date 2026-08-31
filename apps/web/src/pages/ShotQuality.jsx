import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { InitialsTile } from "../components/TeamTile.jsx";
import { gradeClasses } from "../lib/grades.js";
import ShotChart, { NBA_COURT } from "../components/ShotChart.jsx";

// Single-series colour for the shot chart. Matches the prospect series on the
// draft-comp chart (ink-glow), keeping the two charts visually consistent.
const SHOT_COLOR = "#3F4EE0";

function ZoneRow({ zone }) {
  const sign = zone.delta >= 0 ? "+" : "";
  return (
    <div className="grid grid-cols-[1fr_72px_72px_56px_56px] items-center gap-2 border-t border-ink/5 py-2 text-sm">
      <span className="truncate text-ink">{zone.zone}</span>
      <span className={`text-right font-mono ${zone.delta >= 0 ? "text-ink" : "text-stat-down"}`}>{(zone.fg_pct * 100).toFixed(1)}%</span>
      <span className="text-right font-mono text-ink/60">{(zone.xfg_pct * 100).toFixed(1)}%</span>
      <span className={`text-right font-mono text-xs font-bold ${zone.delta >= 0 ? "text-ink" : "text-stat-down"}`}>{sign}{(zone.delta * 100).toFixed(1)}%</span>
      <span className="text-right text-xs text-ink/60">{zone.attempts}</span>
    </div>
  );
}

export default function ShotQuality() {
  const [params] = useSearchParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const preloaded = useRef(false);

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
      const data = await api.shotQuality(pid);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Pre-load from ?player=id&name=… (player-profile quick action)
  useEffect(() => {
    const pid = params.get("player");
    const name = params.get("name") || "";
    if (pid && !preloaded.current) {
      preloaded.current = true;
      analyze(pid, name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const grade = result && gradeClasses(result.overall_grade);

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">Shot Quality · xFG%</h1>
        <p className="mt-1 text-ink/70">
          Hexbin shot chart of every field-goal attempt, plus actual vs expected FG% for each zone.
        </p>
      </header>

      {/* Search */}
      <div className="hoop-card-outline max-w-xl space-y-3 p-5">
        <div className="relative">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/60" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
          </svg>
          <input
            type="text" value={search} onChange={(e) => doSearch(e.target.value)}
            placeholder="Search player… (e.g. Stephen Curry)"
            aria-label="Search player"
            className="w-full rounded-xl border border-ink/10 bg-paper py-2.5 pl-9 pr-3 text-ink placeholder:text-ink/60 focus:border-terracotta focus:outline-none"
          />
        </div>
        {searchResults.length > 0 && (
          <div className="divide-y divide-ink/5 overflow-hidden rounded-xl border border-ink/10 bg-paper">
            {searchResults.map((p) => (
              <button key={p.id} onClick={() => analyze(p.id, p.full_name)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-ink transition hover:bg-ink/5">
                <InitialsTile name={p.full_name} size="sm" />
                {p.full_name}
              </button>
            ))}
          </div>
        )}
        {loading && <p className="animate-pulse text-sm text-ink/70">Fetching shot chart… ~15s</p>}
      </div>

      {error && <p className="rounded-xl border border-terracotta/50 bg-terracotta/30 px-4 py-3 text-sm text-stat-down">{error}</p>}

      {result && (
        <div className="animate-slide-up space-y-5">
          {/* Summary: big grade + player + splits */}
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className={`hoop-card-outline flex items-center gap-4 p-5 ring-1 ${grade.ring}`}>
              <span className={`font-hoop text-6xl font-extrabold leading-none ${grade.text}`}>
                {result.overall_grade}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <InitialsTile name={result.player_name} size="sm" />
                  <p className="truncate font-hoop font-semibold text-ink">{result.player_name}</p>
                </div>
                <p className="mt-1 text-xs text-ink/60">Overall shot grade · {result.season}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="hoop-card-outline p-4"><p className="hoop-stat-label">Actual FG%</p><p className="hoop-stat-value">{(result.overall_fg_pct * 100).toFixed(1)}%</p></div>
              <div className="hoop-card-outline p-4"><p className="hoop-stat-label">Expected FG%</p><p className="hoop-stat-value text-ink/70">{(result.overall_xfg_pct * 100).toFixed(1)}%</p></div>
              <div className="hoop-card-outline p-4"><p className="hoop-stat-label">Attempts</p><p className="hoop-stat-value">{result.total_attempts}</p></div>
            </div>
          </div>

          <div className="hoop-card-outline p-5">
            <p className="hoop-stat-label mb-2 text-center">Shot Chart</p>
            {result.shots?.length ? (
              <ShotChart
                shots={result.shots}
                color={SHOT_COLOR}
                court={NBA_COURT}
                made={result.total_made}
                attempts={result.total_attempts}
                label={result.player_name}
                className="mx-auto w-full max-w-[460px]"
              />
            ) : (
              <p className="py-8 text-center text-sm text-ink/60">
                No shot locations available for this player this season.
              </p>
            )}
            <p className="mt-2 text-center text-[10px] text-ink/50">
              Real field-goal locations from NBA play-by-play. Octagon size = shot frequency.
            </p>
          </div>

          <div className="hoop-card-outline p-4">
            <div className="mb-1 grid grid-cols-[1fr_72px_72px_56px_56px] gap-2">
              <span className="hoop-stat-label">Zone</span>
              <span className="hoop-stat-label text-right">FG%</span>
              <span className="hoop-stat-label text-right">xFG%</span>
              <span className="hoop-stat-label text-right">+/-</span>
              <span className="hoop-stat-label text-right">Att</span>
            </div>
            {result.shot_zones.map((z) => <ZoneRow key={z.zone} zone={z} />)}
          </div>

          <p className="text-xs text-ink/50">Season: {result.season} · Data: NBA API</p>
        </div>
      )}
    </div>
  );
}
