import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { InitialsTile } from "../components/TeamTile.jsx";
import ShotChart from "../components/ShotChart.jsx";
import StatRadar from "../components/StatRadar.jsx";
import { BLUE, INK, ORANGE, SUBINK, TRACK } from "../lib/compTheme.js";

// The palette and the six radar axes live in lib/compTheme.js, and the
// hexagon itself in components/StatRadar.jsx, so the Head-to-Head cards plot
// the identical chart instead of a lookalike that can drift out of step.

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
  return (
    <CardShell title={prospect.name} subtitle="College Stat Comp">
      <Legend prospect={prospect.name} comp={comp?.name} compMatch={comp?.match} />
      <p className="mb-1 text-center text-[11px]" style={{ color: SUBINK }}>
        {prospect.team} {prospect.season} · vs {comp?.line?.team} {comp?.line?.season}
      </p>
      <StatRadar a={{ radar: prospect.radar }} b={comp?.line?.radar ? { radar: comp.line.radar } : null} />
    </CardShell>
  );
}

// ── Card 2: shot chart hexbin ─────────────────────────────────────────────────
// The court itself now lives in components/ShotChart.jsx so the regular-player
// chart on Shot Quality renders identically instead of drawing its own.

function ShotChartCard({ data }) {
  const { prospect, comp } = data;
  return (
    <CardShell title={prospect.player} subtitle="Shot Chart Comp">
      <Legend prospect={prospect.player} comp={comp?.player} />
      <div className="mt-3 flex flex-col gap-4 sm:flex-row">
        <ShotChart shots={prospect.shots} color={BLUE} label={prospect.player}
          made={prospect.made} attempts={prospect.attempts} />
        {comp && (
          <ShotChart shots={comp.shots} color={ORANGE} label={comp.player}
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
  const [params] = useSearchParams();

  useEffect(() => {
    api.draftCompList()
      .then((r) => {
        setList(r.prospects || []);
        if (!r.prospects?.length) return;
        // ?p=<slug> deep-link: rosters send rookies here, since a player with
        // no NBA history has a college profile and nothing else to show.
        // Fall back to the first prospect if the slug isn't in the list.
        const wanted = params.get("p");
        const match = wanted && r.prospects.find((p) => p.slug === wanted);
        setSlug(match ? match.slug : r.prospects[0].slug);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

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
