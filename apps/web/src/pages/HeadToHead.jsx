import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import ShotChart, { NBA_COURT } from "../components/ShotChart.jsx";
import StatRadar from "../components/StatRadar.jsx";
import ZoneShotChart from "../components/ZoneShotChart.jsx";
import { BLUE, INK, ORANGE, SUBINK, TRACK } from "../lib/compTheme.js";
import { zoneTotals } from "../lib/shotZones.js";

// Two player-seasons, three cards. The palette, the six radar axes and the
// hexagon itself are shared with Draft Prospect Comps (lib/compTheme.js,
// components/StatRadar.jsx), so the stat card here IS that card rather than a
// second one drawn to match.

// Seeded so the page shows a real comparison on arrival instead of two empty
// pickers. Any matchup is one search away.
const DEFAULT_A = { id: 2544, name: "LeBron James", season: "2012-13" };
const DEFAULT_B = { id: 893, name: "Michael Jordan", season: "1996-97" };

// ?a=<id>&as=<season>&b=<id>&bs=<season> makes a matchup shareable, the same
// way Draft Prospect Comps deep-links a prospect with ?p=<slug>. Names are not
// in the URL — they arrive with the comparison, so a pasted link can't carry a
// stale or wrong name for an id.
function sideFromParams(params, key, fallback) {
  const id = Number(params.get(key));
  const season = params.get(`${key}s`);
  if (!id || !season) return { ...fallback };
  return { id, name: "", season };
}

const pct1 = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

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

// "2012-13 · MIA", or "2020-21 · HOU → BKN" for a season split across teams —
// every stop that year, in the order they were played.
function seasonLabel(side) {
  const teams = side?.teams?.length ? side.teams.join(" → ") : "—";
  return `${side?.season} · ${teams}`;
}

function Legend({ a, b, match }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: BLUE }} />
        <span className="font-semibold">{a.name}</span>
        <span style={{ color: SUBINK }}>{a.season}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: ORANGE }} />
        <span className="font-semibold">{b.name}</span>
        <span style={{ color: SUBINK }}>{b.season}</span>
      </span>
      {match != null && <span style={{ color: SUBINK }}>({match}% match)</span>}
    </div>
  );
}

// ── Card 1: stat radar ────────────────────────────────────────────────────────
function StatCard({ data }) {
  const { a, b, match } = data;
  return (
    <CardShell title={`${a.name} vs ${b.name}`} subtitle="Season Stat Comparison">
      <Legend a={a} b={b} match={match} />
      <p className="mb-1 text-center text-[11px]" style={{ color: SUBINK }}>
        {seasonLabel(a)} · vs {seasonLabel(b)}
      </p>
      <StatRadar a={{ radar: a.radar }} b={{ radar: b.radar }} />
    </CardShell>
  );
}

// ── Card 2: accolades won IN that season ──────────────────────────────────────
function AccoladeColumn({ side, color }) {
  return (
    <div className="flex-1">
      <p className="text-center text-lg font-bold" style={{ color }}>{side.name}</p>
      <p className="text-center text-[11px] uppercase tracking-widest" style={{ color: SUBINK }}>
        {seasonLabel(side)}
      </p>
      {side.awards.length === 0 ? (
        <p className="mt-3 text-center text-xs" style={{ color: SUBINK }}>
          No league accolades this season.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {side.awards.map((aw) => (
            <li key={aw.label}
              className="flex items-baseline justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm"
              style={{ background: TRACK }}>
              <span className="font-semibold">{aw.label}</span>
              {/* Player of the Week/Month can be won several times a year; one
                  line with a count keeps them from burying the season awards. */}
              {aw.count > 1 && (
                <span className="shrink-0 tabular-nums text-xs" style={{ color: SUBINK }}>×{aw.count}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccoladesCard({ data }) {
  const { a, b } = data;
  return (
    <CardShell title="Accolades" subtitle="Won In These Seasons Only">
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:gap-4">
        <AccoladeColumn side={a} color={BLUE} />
        <AccoladeColumn side={b} color={ORANGE} />
      </div>
      <p className="mt-3 text-center text-[10px]" style={{ color: SUBINK }}>
        Career totals are excluded — these are only the awards won in the selected year.
      </p>
    </CardShell>
  );
}

// ── Card 3: efficiency ────────────────────────────────────────────────────────
// Both courts render identically; the bar underneath is what says who shot
// better. Splitting the track by each player's share of the combined FG%
// keeps the comparison honest — the gap is drawn to scale rather than being
// a fixed-size "winner" flourish.
function DeltaBar({ a, b, leader, delta }) {
  const total = a.fg_pct + b.fg_pct;
  const aShare = total ? (a.fg_pct / total) * 100 : 50;
  const leaderName = leader === "a" ? a.name : leader === "b" ? b.name : null;
  const leaderColor = leader === "a" ? BLUE : ORANGE;

  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between text-sm tabular-nums">
        <span className="font-semibold" style={{ color: BLUE }}>{pct1(a.fg_pct)} FG</span>
        <span className="text-[11px] uppercase tracking-widest" style={{ color: SUBINK }}>Field Goal %</span>
        <span className="font-semibold" style={{ color: ORANGE }}>{pct1(b.fg_pct)} FG</span>
      </div>
      <div className="relative flex h-3.5 w-full overflow-hidden rounded-full" style={{ background: TRACK }}>
        <div style={{ width: `${aShare}%`, background: BLUE }} />
        <div style={{ width: `${100 - aShare}%`, background: ORANGE }} />
        {/* Even split marker — the reference the two shares are read against. */}
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2" style={{ background: "#F2F1EA" }} />
      </div>
      <p className="mt-2 text-center text-sm">
        {leaderName ? (
          <>
            <span className="font-bold" style={{ color: leaderColor }}>{leaderName}</span>
            <span style={{ color: SUBINK }}>
              {" "}shot {(delta * 100).toFixed(1)} percentage points better
            </span>
          </>
        ) : (
          <span style={{ color: SUBINK }}>Both shot the same field-goal percentage.</span>
        )}
      </p>
    </div>
  );
}

// Hexbin answers "where does this player shoot from", zones answer "how well
// does he shoot from each spot" — different questions, so neither replaces the
// other and the card offers both off one set of shots.
function ViewToggle({ view, setView }) {
  return (
    <div className="mt-3 flex justify-center">
      <div className="inline-flex rounded-xl border border-ink/15 p-0.5">
        {[["hexbin", "Hexbin"], ["zones", "Zones"]].map(([key, text]) => (
          <button key={key} type="button" onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-widest transition ${
              view === key ? "bg-terracotta/15 text-terracotta" : "text-ink/60 hover:text-ink"
            }`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function EfficiencyCard({ data, view, setView }) {
  const { a, b, leader, delta } = data;
  // Both charts need both players' zone splits — the fills are the comparison,
  // so each court is colored against the other one's totals.
  const aZones = useMemo(() => zoneTotals(a.shots), [a.shots]);
  const bZones = useMemo(() => zoneTotals(b.shots), [b.shots]);

  return (
    <CardShell title="Efficiency" subtitle="Shot Chart & Field Goal %">
      <Legend a={a} b={b} />
      <ViewToggle view={view} setView={setView} />
      <div className="mt-3 flex flex-col gap-4 sm:flex-row">
        {view === "hexbin" ? (
          <>
            <ShotChart shots={a.shots} color={BLUE} label={`${a.name} ${a.season}`}
              made={a.made} attempts={a.attempts} court={NBA_COURT} />
            <ShotChart shots={b.shots} color={ORANGE} label={`${b.name} ${b.season}`}
              made={b.made} attempts={b.attempts} court={NBA_COURT} />
          </>
        ) : (
          <>
            <ZoneShotChart zones={aZones} opponent={bZones} color={BLUE}
              label={`${a.name} ${a.season}`} made={a.made} attempts={a.attempts} />
            <ZoneShotChart zones={bZones} opponent={aZones} color={ORANGE}
              label={`${b.name} ${b.season}`} made={b.made} attempts={b.attempts} />
          </>
        )}
      </div>
      <DeltaBar a={a} b={b} leader={leader} delta={delta} />
      <p className="mt-2 text-center text-[10px]" style={{ color: SUBINK }}>
        {view === "hexbin"
          ? "Real field-goal locations from play-by-play. Octagon size = shot frequency."
          : "▲ green = outshot the other player from that zone, ▼ red = lost it. Zones where either player took under 5 shots are left uncolored."}
      </p>
    </CardShell>
  );
}

// ── Picker: one player + one of their seasons ─────────────────────────────────
function SidePicker({ label, color, value, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Guards against a slow early request overwriting a later one's results.
  const reqId = useRef(0);

  // Debounced so a typed name is one search, not one per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const id = ++reqId.current;
    const t = setTimeout(() => {
      api.h2hSearch(q)
        .then((r) => { if (id === reqId.current) setResults(r.players || []); })
        .catch(() => { if (id === reqId.current) setResults([]); });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Load the chosen player's seasons; keep the current season if they still
  // have it (they won't, across a player change), else fall back to the newest.
  // This response also carries the player's name, which is what fills it in for
  // a side that arrived from the URL with only an id.
  useEffect(() => {
    if (!value.id) { setSeasons([]); return; }
    let live = true;
    setBusy(true); setError(null);
    api.h2hSeasons(value.id)
      .then((r) => {
        if (!live) return;
        const list = r.seasons || [];
        setSeasons(list);
        const next = { ...value };
        if (!next.name && r.name) next.name = r.name;
        if (!list.some((s) => s.season === next.season)) next.season = list[0]?.season ?? null;
        if (next.name !== value.name || next.season !== value.season) onChange(next);
      })
      .catch((e) => { if (live) { setSeasons([]); setError(e.message); } })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.id]);

  const pick = (p) => {
    setQuery(""); setResults([]);
    onChange({ id: p.id, name: p.name, season: null });
  };

  return (
    <div className="hoop-card-outline p-4">
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest" style={{ color }}>
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} />
        {label}
      </p>

      <div className="relative mt-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={value.name || "Search any NBA player…"}
          className="w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/50 focus:border-terracotta focus:outline-none" />
        {results.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-ink/15 bg-paper shadow-lg">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => pick(p)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-terracotta/10">
                  <span className="truncate">{p.name}</span>
                  {p.is_active && <span className="shrink-0 text-[10px] uppercase tracking-widest text-terracotta">active</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 truncate text-lg font-bold" style={{ color }}>{value.name || "No player selected"}</p>

      <select value={value.season || ""} disabled={busy || !seasons.length}
        onChange={(e) => onChange({ ...value, season: e.target.value })}
        className="mt-1.5 w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm text-ink focus:border-terracotta focus:outline-none disabled:opacity-50">
        {busy && <option>Loading seasons…</option>}
        {!busy && !seasons.length && <option>No seasons</option>}
        {seasons.map((s) => (
          <option key={s.season} value={s.season}>
            {s.season} · {s.teams.join(" → ") || "—"} · {s.gp} GP
          </option>
        ))}
      </select>
      {error && <p className="mt-1.5 text-xs text-basketball">{error}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HeadToHead() {
  const [params, setParams] = useSearchParams();
  // Read once on mount: after that the pickers own the state and push TO the
  // URL, so re-reading would fight every selection.
  const [a, setA] = useState(() => sideFromParams(params, "a", DEFAULT_A));
  const [b, setB] = useState(() => sideFromParams(params, "b", DEFAULT_B));
  const [data, setData] = useState(null);
  // Carried in the URL alongside the two player-seasons, so a link can point
  // someone straight at the zone breakdown rather than the hexbin.
  const [view, setView] = useState(() => (params.get("v") === "zones" ? "zones" : "hexbin"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const ready = a.id && a.season && b.id && b.season;
  const samePick = ready && a.id === b.id && a.season === b.season;

  useEffect(() => {
    if (!ready || samePick) { setData(null); return; }
    let live = true;
    setLoading(true); setError(null);
    api.h2hCompare(a.id, a.season, b.id, b.season)
      .then((r) => { if (live) setData(r); })
      .catch((e) => { if (live) { setData(null); setError(e.message); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [a.id, a.season, b.id, b.season, ready, samePick]);

  // Keep the URL in step so the current matchup can be copied out of the address
  // bar. `replace` so picking through a few players doesn't fill the back stack.
  useEffect(() => {
    if (!ready) return;
    setParams({ a: String(a.id), as: a.season, b: String(b.id), bs: b.season, v: view }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id, a.season, b.id, b.season, view, ready]);

  const swap = () => { setA(b); setB(a); };

  const cards = data?.cards;
  const shots = data?.shot_data_available;
  // Say WHICH season has no tracking rather than giving a 1962 matchup the
  // same "no data" line as a fetch that simply came back empty.
  const noTracking = shots && (!shots.a || !shots.b);
  const untracked = noTracking
    ? [!shots.a && `${a.name} ${a.season}`, !shots.b && `${b.name} ${b.season}`].filter(Boolean).join(" and ")
    : null;

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">Head-to-Head Comparison</h1>
        <p className="mt-1 text-ink/70">
          Put any two player-seasons side by side — same six stat axes as the draft comps, the accolades
          each player actually won that year, and their real shot charts. Pick a different year for each
          side to compare across eras.
        </p>
      </header>

      <div className="grid items-start gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <SidePicker label="Player A" color={BLUE} value={a} onChange={setA} />
        <button type="button" onClick={swap}
          className="mx-auto rounded-xl border border-ink/15 bg-paper px-3 py-2 text-xs font-bold uppercase tracking-widest text-ink/70 transition hover:border-terracotta/60 hover:text-terracotta sm:mt-12"
          title="Swap the two sides">
          ⇄ Swap
        </button>
        <SidePicker label="Player B" color={ORANGE} value={b} onChange={setB} />
      </div>

      {samePick && (
        <div className="hoop-card-outline p-3 text-center text-sm text-ink/70">
          Pick two different player-seasons to compare.
        </div>
      )}
      {error && <div className="hoop-card-outline border border-basketball/30 p-3 text-sm text-basketball">{error}</div>}
      {loading && <div className="hoop-card-outline p-6 text-center text-ink/70">Loading comparison…</div>}

      {cards && !loading && (
        <div className="grid gap-6 lg:grid-cols-2">
          {cards.stats
            ? <StatCard data={cards.stats} />
            : <Unavailable title="Stat Comparison" reason="No regular-season box score for one of these seasons." />}
          {cards.accolades
            ? <AccoladesCard data={cards.accolades} />
            : <Unavailable title="Accolades" reason="No award records found for these seasons." />}
          <div id="efficiency" className="scroll-mt-4 lg:col-span-2">
            {cards.efficiency ? (
              <EfficiencyCard data={cards.efficiency} view={view} setView={setView} />
            ) : (
              <Unavailable
                title="Efficiency"
                reason={untracked
                  ? `The NBA has only tracked shot locations since 1996-97, so there is no shot chart for ${untracked}.`
                  : "No play-by-play shot data available for one of these seasons."}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Unavailable({ title, reason }) {
  return (
    <div className="hoop-card-outline flex flex-col items-center justify-center p-6 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-ink/60">{reason}</p>
    </div>
  );
}
