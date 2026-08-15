import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { InitialsTile } from "../components/TeamTile.jsx";

// Matched to the site's paper/ink theme. Prospect = ink blue (solid fill),
// comp = terracotta (dashed outline) — the app's own tokens. Identity never
// rests on color alone: the two series also differ in fill vs dashed stroke.
//
// These are raw hex rather than Tailwind classes because they feed SVG
// fill/stroke attributes, so they don't pick up token changes automatically —
// keep them in step with tailwind.config.js by hand. Every value below is
// chosen for contrast against paper (#F2F1EA): labels land ~8:1, the two
// series and secondary text ~5:1, all comfortably above the 4.5:1 floor at
// the 10–11px sizes this chart draws.
const CARD_BG = "#F2F1EA"; // paper — stroked between hexbins so they read apart
const INK = "#2431C4";     // ink — primary labels (axis names, player names)
const SUBINK = "#4A52B8";  // muted ink — secondary / caption text
const BLUE = "#3F4EE0";    // ink-glow — prospect series
const ORANGE = "#9E4A30";  // terracotta-dim — comp series
const GRID = "rgba(36,49,196,0.22)"; // ink @22% — rings, spokes, court lines
const TRACK = "rgba(36,49,196,0.12)"; // percentile bar track

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ── Radar axes: label, value formatter, and 0–1 normalization for the plot ────
const RADAR_AXES = [
  { key: "scoring", label: "Scoring", fmt: (v) => `${v?.toFixed(1)} PPG`, norm: (v) => clamp01(v / 28) },
  { key: "efficiency", label: "Efficiency", fmt: (v) => `${Math.round(v * 100)} TS%`, norm: (v) => clamp01((v - 0.45) / 0.25) },
  { key: "playmaking", label: "Playmaking", fmt: (v) => `${v?.toFixed(1)} APG`, norm: (v) => clamp01(v / 8) },
  { key: "rebounding", label: "Rebounding", fmt: (v) => `${v?.toFixed(1)} RPG`, norm: (v) => clamp01(v / 12) },
  { key: "defense", label: "Defense", fmt: (v) => `${v?.toFixed(1)} STL+BLK`, norm: (v) => clamp01(v / 4) },
  { key: "shooting", label: "Shooting", fmt: (v) => `${Math.round(v * 100)}% 3P`, norm: (v) => clamp01((v - 0.25) / 0.25) },
];

function CardShell({ title, subtitle, children }) {
  return (
    <div className="hoop-card-outline p-5" style={{ color: INK }}>
      <div className="text-center">
        <h3 className="text-2xl font-bold tracking-tight text-ink" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
          {title}
        </h3>
        <p className="text-xs uppercase tracking-widest" style={{ color: SUBINK }}>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Legend({ prospect, comp, compMatch }) {
  return (
    <div className="mt-3 flex items-center justify-center gap-5 text-sm">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: BLUE }} />
        <span className="font-semibold">{prospect}</span>
      </span>
      {comp && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: ORANGE }} />
          <span className="font-semibold">{comp}</span>
          {compMatch != null && <span style={{ color: SUBINK }}>({compMatch}% match)</span>}
        </span>
      )}
    </div>
  );
}

// ── Card 1: radar / hexagon ───────────────────────────────────────────────────
function RadarCard({ data }) {
  const { prospect, comp } = data;
  const cx = 175, cy = 172, R = 104;
  const compRadar = comp?.line?.radar;

  const pt = (i, n) => {
    const a = (-90 + i * 60) * (Math.PI / 180);
    return [cx + n * R * Math.cos(a), cy + n * R * Math.sin(a)];
  };
  const poly = (radar) =>
    RADAR_AXES.map((ax, i) => pt(i, ax.norm(radar[ax.key] ?? 0)).join(",")).join(" ");

  return (
    <CardShell title={prospect.name} subtitle="College Stat Comp">
      <Legend prospect={prospect.name} comp={comp?.name} compMatch={comp?.match} />
      <p className="mb-1 text-center text-[11px]" style={{ color: SUBINK }}>
        {prospect.team} {prospect.season} · vs {comp?.line?.team} {comp?.line?.season}
      </p>
      <svg viewBox="-75 -6 500 356" className="mx-auto block w-full max-w-[460px]">
        {/* rings */}
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <polygon key={r} points={RADAR_AXES.map((_, i) => pt(i, r).join(",")).join(" ")}
            fill="none" stroke={GRID} strokeWidth="1" />
        ))}
        {/* spokes + labels */}
        {RADAR_AXES.map((ax, i) => {
          const [x, y] = pt(i, 1);
          const [lx, ly] = pt(i, 1.28);
          const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
          return (
            <g key={ax.key}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={GRID} strokeWidth="1" />
              <text x={lx} y={ly - 6} textAnchor={anchor} fontSize="11" fontWeight="700" fill={INK}>{ax.label}</text>
              <text x={lx} y={ly + 6} textAnchor={anchor} fontSize="10" fill={BLUE}>{ax.fmt(prospect.radar[ax.key])}</text>
              {compRadar && (
                <text x={lx} y={ly + 18} textAnchor={anchor} fontSize="10" fill={ORANGE}>{ax.fmt(compRadar[ax.key])}</text>
              )}
            </g>
          );
        })}
        {/* comp polygon (dashed outline) */}
        {compRadar && (
          <polygon points={poly(compRadar)} fill="none" stroke={ORANGE} strokeWidth="2" strokeDasharray="5 4" />
        )}
        {/* prospect polygon (solid fill) */}
        <polygon points={poly(prospect.radar)} fill={BLUE} fillOpacity="0.32" stroke={BLUE} strokeWidth="2" />
      </svg>
    </CardShell>
  );
}

// ── Card 2: shot chart hexbin ─────────────────────────────────────────────────
// ESPN coords: x 0–50 (court width), y = feet from baseline (basket ~4ft).
const COURT_W = 300, COURT_H = 282, FT = 6; // px per foot

function courtToPx(s) {
  return { px: (s.x / 50) * COURT_W, py: s.y * FT + 24 };
}

function hexbin(shots, radius) {
  const dx = radius * Math.sqrt(3), dy = radius * 1.5;
  const bins = new Map();
  for (const s of shots) {
    const { px, py } = courtToPx(s);
    const row = Math.round(py / dy);
    const xoff = row % 2 ? dx / 2 : 0;
    const col = Math.round((px - xoff) / dx);
    const key = `${col},${row}`;
    const cx = col * dx + xoff, cy = row * dy;
    if (!bins.has(key)) bins.set(key, { cx, cy, count: 0 });
    bins.get(key).count += 1;
  }
  return [...bins.values()];
}

function octagonPoints(cx, cy, r) {
  const p = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + i * (Math.PI / 4); // flat-top octagon
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return p.map((q) => q.map((n) => n.toFixed(1)).join(",")).join(" ");
}

function HalfCourt({ shots, color, label, made, attempts }) {
  const r = 11;
  const bins = useMemo(() => hexbin(shots, r), [shots]);
  const max = Math.max(1, ...bins.map((b) => b.count));
  const hoopX = (25 / 50) * COURT_W, hoopY = 4 * FT + 24;
  return (
    <div className="flex-1">
      <p className="mb-1 text-center text-xs font-semibold" style={{ color }}>
        {label} · {made}/{attempts} ({((made / attempts) * 100).toFixed(0)}% FG)
      </p>
      <svg viewBox={`0 0 ${COURT_W} ${COURT_H}`} className="w-full">
        {/* court outline */}
        <rect x="1" y="1" width={COURT_W - 2} height={COURT_H - 2} fill="none" stroke={GRID} strokeWidth="1.5" />
        {/* paint */}
        <rect x={hoopX - 6 * FT} y="0" width={12 * FT} height={19 * FT} fill="none" stroke={GRID} strokeWidth="1.2" />
        {/* 3pt arc (~22.75ft) */}
        <path d={`M ${hoopX - 22 * FT} 0 L ${hoopX - 22 * FT} ${9 * FT} A ${22 * FT} ${22 * FT} 0 0 0 ${hoopX + 22 * FT} ${9 * FT} L ${hoopX + 22 * FT} 0`}
          fill="none" stroke={GRID} strokeWidth="1.2" />
        {/* hoop */}
        <circle cx={hoopX} cy={hoopY} r="4" fill="none" stroke={GRID} strokeWidth="1.5" />
        {/* binned octagons — size (area) scales with shot frequency */}
        {bins.map((b, i) => {
          const rad = 2.5 + (r * 0.95 - 2.5) * Math.sqrt(b.count / max);
          return (
            <polygon key={i} points={octagonPoints(b.cx, b.cy, rad)}
              fill={color} fillOpacity={(0.28 + 0.72 * (b.count / max)).toFixed(2)}
              stroke={CARD_BG} strokeWidth="0.5" />
          );
        })}
      </svg>
    </div>
  );
}

function ShotChartCard({ data }) {
  const { prospect, comp } = data;
  return (
    <CardShell title={prospect.player} subtitle="Shot Chart Comp">
      <Legend prospect={prospect.player} comp={comp?.player} />
      <div className="mt-3 flex flex-col gap-4 sm:flex-row">
        <HalfCourt shots={prospect.shots} color={BLUE} label={prospect.player}
          made={prospect.made} attempts={prospect.attempts} />
        {comp && (
          <HalfCourt shots={comp.shots} color={ORANGE} label={comp.player}
            made={comp.made} attempts={comp.attempts} />
        )}
      </div>
      <p className="mt-2 text-center text-[10px]" style={{ color: SUBINK }}>
        Real field-goal locations from play-by-play. Octagon size = shot frequency.
      </p>
    </CardShell>
  );
}

// ── Card 3: combine percentile bars ───────────────────────────────────────────
const COMBINE_ROWS = [
  { key: "height", label: "Height", disp: (data) => data.height_ft_in },
  { key: "wingspan", label: "Wingspan", disp: (data) => data.wingspan_ft_in },
  { key: "standing_reach", label: "Standing Reach", disp: (data) => data.standing_reach_ft_in },
  { key: "weight", label: "Weight", disp: (data, m) => `${Math.round(m.value)} lbs` },
  { key: "max_vertical", label: "Max Vertical", disp: (data, m) => `${m.value}"` },
];

function fmtMeasure(key, val) {
  if (val == null) return "—";
  if (key === "weight") return `${Math.round(val)} lbs`;
  if (key === "max_vertical") return `${val}"`;
  const ft = Math.floor(val / 12);
  return `${ft}' ${(val - ft * 12).toFixed(1)}"`;
}

function CombineCard({ data }) {
  const comp = data.comp;
  return (
    <CardShell title={data.player} subtitle={`Combine Measurements · Percentile vs NBA ${data.position || "Guards"}`}>
      <Legend prospect={data.player} comp={comp?.name} compMatch={comp?.match} />
      <div className="mt-4 space-y-3">
        {COMBINE_ROWS.map((row) => {
          const m = data.measures[row.key];
          const compVal = comp?.values?.[row.key];
          return (
            <div key={row.key}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-semibold">{row.label}</span>
                <span className="flex items-baseline gap-2 tabular-nums">
                  {comp && compVal != null && (
                    <span className="text-xs" style={{ color: ORANGE }}>{fmtMeasure(row.key, compVal)}</span>
                  )}
                  <span>{m ? row.disp(data, m) : <span style={{ color: SUBINK }}>not measured</span>}</span>
                  {m && <span className="text-xs" style={{ color: SUBINK }}>{m.percentile}th</span>}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full" style={{ background: TRACK }}>
                {m && <div className="h-full rounded-full" style={{ width: `${m.percentile}%`, background: BLUE }} />}
              </div>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DraftComps() {
  const [list, setList] = useState([]);
  const [slug, setSlug] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.draftCompList()
      .then((r) => {
        setList(r.prospects || []);
        if (r.prospects?.length) setSlug(r.prospects[0].slug);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!slug) return;
    setLoading(true); setError(null);
    api.draftComp(slug)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const cards = data?.cards;
  const sorted = useMemo(
    () => [...list].sort((a, b) => (a.pick ?? 999) - (b.pick ?? 999)),
    [list],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((p) => p.name.toLowerCase().includes(q) || (p.college || "").toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">Draft Prospect Comps</h1>
        <p className="mt-1 text-ink/70">
          Grounded comparisons for the 2026 draft class — real college stats, shot locations, and combine
          measurements matched to NBA players. No projections, just data.
        </p>
      </header>

      {list.length > 0 && (
        <div className="hoop-card-outline p-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${list.length} prospects by name or school…`}
            className="mb-2 w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/50 focus:border-terracotta focus:outline-none" />
          <div className="flex max-h-52 flex-wrap gap-2 overflow-y-auto pr-1">
            {filtered.map((p) => (
              <button key={p.slug} onClick={() => setSlug(p.slug)}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm transition ${
                  slug === p.slug ? "border-terracotta/60 bg-terracotta/10 text-terracotta" : "border-ink/10 bg-paper text-ink hover:border-ink/25"
                }`}>
                {p.pick && <span className="font-mono text-xs text-ink/60">#{p.pick}</span>}
                <span className="truncate">{p.name}</span>
                <span className="flex gap-0.5" title="available cards">
                  <Dot on={p.has_radar} /><Dot on={p.has_shot_chart} /><Dot on={p.has_combine} />
                </span>
              </button>
            ))}
            {filtered.length === 0 && <p className="p-2 text-sm text-ink/60">No prospects match “{query}”.</p>}
          </div>
        </div>
      )}

      {error && <div className="hoop-card-outline border border-basketball/30 p-3 text-sm text-basketball">{error}</div>}
      {loading && <div className="hoop-card-outline p-6 text-center text-ink/70">Loading comparison…</div>}

      {cards && !loading && (
        <div className="grid gap-6 lg:grid-cols-2">
          {cards.radar ? <RadarCard data={cards.radar} /> : <Unavailable title="Stat Comp" reason="No college stats found for this player (likely an international prospect)." />}
          {cards.combine ? <CombineCard data={cards.combine} /> : <Unavailable title="Combine Comp" reason="This player didn't attend the NBA combine, so no measurements are available." />}
          <div className="lg:col-span-2">
            {cards.shot_chart ? <ShotChartCard data={cards.shot_chart} /> : <Unavailable title="Shot Chart" reason="No play-by-play shot data available for this player (international or untracked)." />}
          </div>
        </div>
      )}
    </div>
  );
}

function Dot({ on }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${on ? "bg-terracotta" : "bg-ink/15"}`} />;
}

function Unavailable({ title, reason }) {
  return (
    <div className="hoop-card-outline flex flex-col items-center justify-center p-6 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-ink/60">{reason}</p>
    </div>
  );
}
