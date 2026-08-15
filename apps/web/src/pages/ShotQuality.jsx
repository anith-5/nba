import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { InitialsTile } from "../components/TeamTile.jsx";
import { gradeClasses } from "../lib/grades.js";

// Hot-zone map is an intentional green→red data scale (not brand color).
function deltaColor(delta) {
  if (delta == null) return "#1e2535";
  if (delta >= 0.12) return "#15803d";
  if (delta >= 0.07) return "#22c55e";
  if (delta >= 0.03) return "#86efac";
  if (delta >= -0.03) return "#64748b";
  if (delta >= -0.07) return "#f87171";
  if (delta >= -0.12) return "#ef4444";
  return "#b91c1c";
}

function HotZoneMap({ zones, playerName }) {
  const [hovered, setHovered] = useState(null);
  const zm = {};
  zones.forEach((z) => { zm[z.zone] = z; });
  const zf = (name) => (zm[name] ? deltaColor(zm[name].delta) : "#1e2535");
  const noData = (name) => !zm[name];
  const tip = hovered && zm[hovered];

  function Label({ name, x, y, small }) {
    const z = zm[name];
    if (!z) return null;
    const fs = small ? 9 : 12;
    const fs2 = small ? 7 : 9;
    return (
      <g style={{ pointerEvents: "none" }}>
        <text x={x} y={y - 6} textAnchor="middle" fill="white" fontSize={fs} fontWeight="bold">
          {(z.fg_pct * 100).toFixed(0)}%
        </text>
        <text x={x} y={y + 5} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize={fs2}>
          {z.attempts} att
        </text>
      </g>
    );
  }

  return (
    <div className="space-y-3">
      <p className="hoop-stat-label text-center">{playerName} — Shot Hot Zones</p>
      <div className="relative">
        <svg viewBox="0 0 500 470" className="mx-auto w-full max-w-lg">
          <defs>
            <clipPath id="court"><rect x="2" y="2" width="496" height="466" /></clipPath>
          </defs>
          <rect x="0" y="0" width="500" height="470" fill="#0F172A" rx="6" />
          <g clipPath="url(#court)">
            <rect x="2" y="2" width="496" height="466" fill={zf("Above the Break 3")} opacity={noData("Above the Break 3") ? 0.25 : 0.82} onMouseEnter={() => setHovered("Above the Break 3")} onMouseLeave={() => setHovered(null)} />
            <circle cx="250" cy="410" r="237.5" fill={zf("Mid-Range")} opacity={noData("Mid-Range") ? 0.25 : 0.82} onMouseEnter={() => setHovered("Mid-Range")} onMouseLeave={() => setHovered(null)} />
            <rect x="2" y="321" width="28" height="148" fill={zf("Left Corner 3")} opacity={noData("Left Corner 3") ? 0.25 : 0.82} onMouseEnter={() => setHovered("Left Corner 3")} onMouseLeave={() => setHovered(null)} />
            <rect x="470" y="321" width="28" height="148" fill={zf("Right Corner 3")} opacity={noData("Right Corner 3") ? 0.25 : 0.82} onMouseEnter={() => setHovered("Right Corner 3")} onMouseLeave={() => setHovered(null)} />
            <rect x="170" y="280" width="160" height="189" fill={zf("In The Paint (Non-RA)")} opacity={noData("In The Paint (Non-RA)") ? 0.25 : 0.82} onMouseEnter={() => setHovered("In The Paint (Non-RA)")} onMouseLeave={() => setHovered(null)} />
            <circle cx="250" cy="410" r="40" fill={zf("Restricted Area")} opacity={noData("Restricted Area") ? 0.25 : 0.82} onMouseEnter={() => setHovered("Restricted Area")} onMouseLeave={() => setHovered(null)} />
          </g>
          {/* Court lines */}
          <rect x="2" y="2" width="496" height="467" fill="none" stroke="#475569" strokeWidth="2" />
          <line x1="2" y1="2" x2="498" y2="2" stroke="#475569" strokeWidth="2" />
          <path d="M 190,2 A 60,60 0 0,1 310,2" fill="none" stroke="#475569" strokeWidth="1.5" />
          <rect x="170" y="280" width="160" height="189" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
          <path d="M 170,280 A 80,80 0 0,0 330,280" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
          <path d="M 170,280 A 80,80 0 0,1 330,280" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5,4" />
          <path d="M 210,410 A 40,40 0 0,0 290,410" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="30" y1="469" x2="30" y2="321" stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="470" y1="469" x2="470" y2="321" stroke="#94a3b8" strokeWidth="1.5" />
          <path d="M 30,321 A 237.5,237.5 0 1,0 470,321" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="218" y1="467" x2="282" y2="467" stroke="#94a3b8" strokeWidth="3" />
          <circle cx="250" cy="410" r="10" fill="none" stroke="#94a3b8" strokeWidth="2" />
          {[302, 337, 372, 407].map((y) => (
            <g key={y}>
              <line x1="155" y1={y} x2="170" y2={y} stroke="#475569" strokeWidth="1.5" />
              <line x1="330" y1={y} x2="345" y2={y} stroke="#475569" strokeWidth="1.5" />
            </g>
          ))}
          {/* Labels */}
          <Label name="Restricted Area" x={250} y={413} />
          <Label name="In The Paint (Non-RA)" x={200} y={325} />
          <Label name="In The Paint (Non-RA)" x={300} y={325} />
          <Label name="Mid-Range" x={250} y={228} />
          <Label name="Mid-Range" x={110} y={370} />
          <Label name="Mid-Range" x={390} y={370} />
          <Label name="Left Corner 3" x={16} y={400} small />
          <Label name="Right Corner 3" x={484} y={400} small />
          <Label name="Above the Break 3" x={250} y={110} />
          <Label name="Above the Break 3" x={80} y={230} />
          <Label name="Above the Break 3" x={420} y={230} />
        </svg>

        {tip && (
          <div className="absolute right-2 top-2 min-w-[150px] space-y-1 rounded-xl border border-ink/10 bg-paper-raised/95 p-3 text-xs shadow-card ">
            <p className="text-[11px] font-semibold leading-tight text-ink">{hovered}</p>
            <div className="space-y-0.5 border-t border-ink/10 pt-1">
              <p className="text-ink">FG%: <span className="font-mono text-ink">{(tip.fg_pct * 100).toFixed(1)}%</span></p>
              <p className="text-ink">xFG%: <span className="font-mono text-ink/70">{(tip.xfg_pct * 100).toFixed(1)}%</span></p>
              <p className="text-ink">Delta:
                <span className={`ml-1 font-mono font-bold ${tip.delta >= 0 ? "text-ink" : "text-stat-down"}`}>
                  {tip.delta >= 0 ? "+" : ""}{(tip.delta * 100).toFixed(1)}%
                </span>
              </p>
              <p className="text-ink">Attempts: <span className="font-mono text-ink">{tip.attempts}</span></p>
              <p className="text-ink">Grade: <span className="font-mono text-ink">{tip.grade}</span></p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs">
        {[["#b91c1c", "Cold"], ["#ef4444", ""], ["#f87171", ""], ["#64748b", "Avg"], ["#86efac", ""], ["#22c55e", ""], ["#15803d", "Hot"]].map(([color, label], i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div className="h-4 w-7 rounded-sm" style={{ backgroundColor: color }} />
            {label && <span className="text-[10px] text-ink/60">{label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

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
          2K-style hot-zone map — green is above expected FG%, red is below. Hover any zone for detail.
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
            <HotZoneMap zones={result.shot_zones} playerName={result.player_name} />
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

          <p className="text-xs text-ink/50">Season: {result.season} · Data: NBA API · Hover zones for details</p>
        </div>
      )}
    </div>
  );
}
