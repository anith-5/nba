import { useState } from "react";
import { api } from "../api.js";

const GRADE_COLOR = {
  "A+": "text-court-glow", A: "text-court", "B+": "text-blue-400", B: "text-blue-300",
  "C+": "text-yellow-400", C: "text-yellow-500", D: "text-orange-400", F: "text-red-400",
};

// SVG: 500 wide x 470 tall  |  basket at bottom: (250, 410)  |  baseline: y = 469
// Paint: x 170-330, y 280-469   FT line: y = 280   FT circle r = 80 centred (250,280)
// 3pt arc: circle r = 237.5 centred at basket (250,410)
//   → at x=30 & x=470 this circle crosses y≈321 (the "corner" height)
//   → straight sections run from y=469 (baseline) to y=321 at x=30 and x=470
// Half-court: y = 1

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
  zones.forEach(z => { zm[z.zone] = z; });

  const zf = name => zm[name] ? deltaColor(zm[name].delta) : "#1e2535";
  const noData = name => !zm[name];

  const tip = hovered && zm[hovered];

  // Label inside each zone
  function Label({ name, x, y, small }) {
    const z = zm[name];
    if (!z) return null;
    const fs = small ? 9 : 12;
    const fs2 = small ? 7 : 9;
    return (
      <g style={{ pointerEvents: "none" }}>
        <text x={x} y={y - 6} textAnchor="middle" fill="white"
          fontSize={fs} fontWeight="bold">
          {(z.fg_pct * 100).toFixed(0)}%
        </text>
        <text x={x} y={y + 5} textAnchor="middle"
          fill="rgba(255,255,255,0.55)" fontSize={fs2}>
          {z.attempts} att
        </text>
      </g>
    );
  }

  return (
    <div className="space-y-3">
      <p className="stat-label text-center">{playerName} — Shot Hot Zones</p>

      <div className="relative">
        <svg viewBox="0 0 500 470" className="w-full max-w-lg mx-auto">
          <defs>
            {/* Clip all zone fills to the in-bounds court area */}
            <clipPath id="court">
              <rect x="2" y="2" width="496" height="466" />
            </clipPath>
          </defs>

          {/* Court floor */}
          <rect x="0" y="0" width="500" height="470" fill="#0f172a" rx="6" />

          {/* ─────────────────────────────────────────────
              ZONE FILLS  (back → front; later layers sit
              visually on top and handle mouse events)
              ───────────────────────────────────────────── */}
          <g clipPath="url(#court)">

            {/* 1 ▸ Above the Break 3 — fills the whole court first */}
            <rect x="2" y="2" width="496" height="466"
              fill={zf("Above the Break 3")} opacity={noData("Above the Break 3") ? 0.25 : 0.82}
              onMouseEnter={() => setHovered("Above the Break 3")}
              onMouseLeave={() => setHovered(null)} />

            {/* 2 ▸ Mid-Range — circle r=237.5 centred at basket covers
                everything inside the 3pt arc (paint & RA drawn on top) */}
            <circle cx="250" cy="410" r="237.5"
              fill={zf("Mid-Range")} opacity={noData("Mid-Range") ? 0.25 : 0.82}
              onMouseEnter={() => setHovered("Mid-Range")}
              onMouseLeave={() => setHovered(null)} />

            {/* 3 ▸ Corner 3s — drawn AFTER the circle so they override
                the mid-range fill where the circle bleeds into the corners */}
            <rect x="2" y="321" width="28" height="148"
              fill={zf("Left Corner 3")} opacity={noData("Left Corner 3") ? 0.25 : 0.82}
              onMouseEnter={() => setHovered("Left Corner 3")}
              onMouseLeave={() => setHovered(null)} />
            <rect x="470" y="321" width="28" height="148"
              fill={zf("Right Corner 3")} opacity={noData("Right Corner 3") ? 0.25 : 0.82}
              onMouseEnter={() => setHovered("Right Corner 3")}
              onMouseLeave={() => setHovered(null)} />

            {/* 4 ▸ Paint */}
            <rect x="170" y="280" width="160" height="189"
              fill={zf("In The Paint (Non-RA)")} opacity={noData("In The Paint (Non-RA)") ? 0.25 : 0.82}
              onMouseEnter={() => setHovered("In The Paint (Non-RA)")}
              onMouseLeave={() => setHovered(null)} />

            {/* 5 ▸ Restricted Area */}
            <circle cx="250" cy="410" r="40"
              fill={zf("Restricted Area")} opacity={noData("Restricted Area") ? 0.25 : 0.82}
              onMouseEnter={() => setHovered("Restricted Area")}
              onMouseLeave={() => setHovered(null)} />

          </g>

          {/* ─────────────────────────────────────────────
              COURT LINES — on top of zone fills
              ───────────────────────────────────────────── */}

          {/* Boundary */}
          <rect x="2" y="2" width="496" height="467"
            fill="none" stroke="#475569" strokeWidth="2" />

          {/* Half-court line */}
          <line x1="2" y1="2" x2="498" y2="2" stroke="#475569" strokeWidth="2" />
          {/* Half-court centre circle (lower arc visible) */}
          <path d="M 190,2 A 60,60 0 0,1 310,2"
            fill="none" stroke="#475569" strokeWidth="1.5" />

          {/* Paint box */}
          <rect x="170" y="280" width="160" height="189"
            fill="none" stroke="#94a3b8" strokeWidth="1.5" />

          {/* FT circle — upper (solid) */}
          <path d="M 170,280 A 80,80 0 0,0 330,280"
            fill="none" stroke="#94a3b8" strokeWidth="1.5" />
          {/* FT circle — lower inside key (dashed) */}
          <path d="M 170,280 A 80,80 0 0,1 330,280"
            fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5,4" />

          {/* Restricted-area arc (opens toward centre court) */}
          <path d="M 210,410 A 40,40 0 0,0 290,410"
            fill="none" stroke="#94a3b8" strokeWidth="1.5" />

          {/* 3-point line */}
          <line x1="30" y1="469" x2="30" y2="321"
            stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="470" y1="469" x2="470" y2="321"
            stroke="#94a3b8" strokeWidth="1.5" />
          <path d="M 30,321 A 237.5,237.5 0 1,0 470,321"
            fill="none" stroke="#94a3b8" strokeWidth="1.5" />

          {/* Backboard & basket */}
          <line x1="218" y1="467" x2="282" y2="467"
            stroke="#94a3b8" strokeWidth="3" />
          <circle cx="250" cy="410" r="10"
            fill="none" stroke="#94a3b8" strokeWidth="2" />

          {/* Lane hash marks */}
          {[302, 337, 372, 407].map(y => (
            <g key={y}>
              <line x1="155" y1={y} x2="170" y2={y} stroke="#475569" strokeWidth="1.5" />
              <line x1="330" y1={y} x2="345" y2={y} stroke="#475569" strokeWidth="1.5" />
            </g>
          ))}

          {/* ─────────────────────────────────────────────
              ZONE LABELS
              ───────────────────────────────────────────── */}

          {/* Restricted Area */}
          <Label name="Restricted Area" x={250} y={413} />

          {/* Paint — two spots to avoid overlap with RA label */}
          <Label name="In The Paint (Non-RA)" x={200} y={325} />
          <Label name="In The Paint (Non-RA)" x={300} y={325} />

          {/* Mid-Range — FT area centre */}
          <Label name="Mid-Range" x={250} y={228} />
          {/* Mid-Range side labels (elbow areas) */}
          <Label name="Mid-Range" x={110} y={370} />
          <Label name="Mid-Range" x={390} y={370} />

          {/* Corners */}
          <Label name="Left Corner 3"  x={16} y={400} small />
          <Label name="Right Corner 3" x={484} y={400} small />

          {/* Above the Break 3 */}
          <Label name="Above the Break 3" x={250} y={110} />
          {/* Side above-break labels */}
          <Label name="Above the Break 3" x={80}  y={230} />
          <Label name="Above the Break 3" x={420} y={230} />

        </svg>

        {/* Hover tooltip */}
        {tip && (
          <div className="absolute top-2 right-2 bg-slate-800/95 border border-slate-700 rounded-lg p-3 text-xs space-y-1 min-w-[145px] shadow-xl">
            <p className="font-semibold text-white text-[11px] leading-tight">{hovered}</p>
            <div className="border-t border-slate-700 pt-1 space-y-0.5">
              <p className="text-slate-300">FG%: <span className="font-mono text-white">{(tip.fg_pct * 100).toFixed(1)}%</span></p>
              <p className="text-slate-300">xFG%: <span className="font-mono text-slate-400">{(tip.xfg_pct * 100).toFixed(1)}%</span></p>
              <p className="text-slate-300">Delta:
                <span className={`font-mono font-bold ml-1 ${tip.delta >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {tip.delta >= 0 ? "+" : ""}{(tip.delta * 100).toFixed(1)}%
                </span>
              </p>
              <p className="text-slate-300">Attempts: <span className="font-mono text-white">{tip.attempts}</span></p>
              <p className="text-slate-300">Grade: <span className="font-mono text-white">{tip.grade}</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-1.5 text-xs">
        {[
          ["#b91c1c", "Cold"],
          ["#ef4444", ""],
          ["#f87171", ""],
          ["#64748b", "Avg"],
          ["#86efac", ""],
          ["#22c55e", ""],
          ["#15803d", "Hot"],
        ].map(([color, label], i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div className="w-7 h-4 rounded-sm" style={{ backgroundColor: color }} />
            {label && <span className="text-slate-500 text-[10px]">{label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function GradeBadge({ grade }) {
  return (
    <span className={`font-mono text-2xl font-bold ${GRADE_COLOR[grade] ?? "text-white"}`}>
      {grade}
    </span>
  );
}

function ZoneRow({ zone }) {
  const sign = zone.delta >= 0 ? "+" : "";
  return (
    <div className="grid grid-cols-[1fr_72px_72px_56px_56px] items-center gap-2 py-2 border-t border-slate-800 text-sm">
      <span className="text-slate-300 truncate">{zone.zone}</span>
      <span className={`font-mono text-right ${zone.delta >= 0 ? "text-court-glow" : "text-red-400"}`}>
        {(zone.fg_pct * 100).toFixed(1)}%
      </span>
      <span className="font-mono text-right text-slate-500">{(zone.xfg_pct * 100).toFixed(1)}%</span>
      <span className={`font-mono text-right text-xs font-bold ${zone.delta >= 0 ? "text-court" : "text-red-400"}`}>
        {sign}{(zone.delta * 100).toFixed(1)}%
      </span>
      <span className="text-slate-500 text-xs text-right">{zone.attempts}</span>
    </div>
  );
}

export default function ShotQuality() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);

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

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Shot Quality (xFG%)</h1>
        <p className="mt-1 text-slate-400">
          Hot zone map — green = above expected FG%, red = below. Hover any zone for details.
        </p>
      </header>

      <div className="card max-w-xl p-6 space-y-3">
        <label className="block text-sm">
          <span className="stat-label">Search player</span>
          <input
            type="text" value={search}
            onChange={e => doSearch(e.target.value)}
            placeholder="e.g. Stephen Curry"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </label>
        {searchResults.length > 0 && (
          <div className="rounded border border-slate-700 bg-slate-900 divide-y divide-slate-800">
            {searchResults.map(p => (
              <button key={p.id} onClick={() => analyze(p.id, p.full_name)}
                className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800">
                {p.full_name}
              </button>
            ))}
          </div>
        )}
        {loading && <p className="text-slate-400 text-sm animate-pulse">Fetching shot chart… (~15s)</p>}
      </div>

      {error && <p className="text-amber-300">{error}</p>}

      {result && (
        <div className="space-y-5 animate-slide-up">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="card p-4 text-center">
              <p className="stat-label mb-1">Shot Grade</p>
              <GradeBadge grade={result.overall_grade} />
            </div>
            <div className="card p-4">
              <p className="stat-label">Actual FG%</p>
              <p className="stat-value">{(result.overall_fg_pct * 100).toFixed(1)}%</p>
            </div>
            <div className="card p-4">
              <p className="stat-label">Expected FG%</p>
              <p className="stat-value text-slate-400">{(result.overall_xfg_pct * 100).toFixed(1)}%</p>
            </div>
            <div className="card p-4">
              <p className="stat-label">Total Attempts</p>
              <p className="stat-value">{result.total_attempts}</p>
            </div>
          </div>

          <div className="card p-5">
            <HotZoneMap zones={result.shot_zones} playerName={result.player_name} />
          </div>

          <div className="card p-4">
            <div className="grid grid-cols-[1fr_72px_72px_56px_56px] gap-2 mb-1">
              <span className="stat-label">Zone</span>
              <span className="stat-label text-right">FG%</span>
              <span className="stat-label text-right">xFG%</span>
              <span className="stat-label text-right">+/-</span>
              <span className="stat-label text-right">Att</span>
            </div>
            {result.shot_zones.map(z => <ZoneRow key={z.zone} zone={z} />)}
          </div>

          <p className="text-xs text-slate-600">
            Season: {result.season} · Data: NBA API · Hover zones for details
          </p>
        </div>
      )}
    </div>
  );
}
