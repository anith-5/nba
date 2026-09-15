import { useMemo, useState } from "react";
import { api } from "../api.js";

const SCENARIOS = [
  { value: "three_point_back", label: "Move 3-Point Line Back 2 Feet" },
  { value: "no_corner_three", label: "Eliminate Corner 3-Pointers" },
  { value: "wider_lane", label: "Widen the Lane (16→20 ft)" },
  { value: "four_point_line", label: "Add a 4-Point Line (30+ ft)" },
  { value: "shorter_shot_clock", label: "Shorten Shot Clock to 18s" },
];

// Gain/loss is a polarity job, so it gets two opposite-temperature poles. The
// site's own stat.up green was the obvious pick, but it fails as a chart mark:
// it reads as gray at bar size (chroma under the floor), and against the red it
// separates only ΔE 8.0 for deuteranopes. The app's chart blue does ΔE 28.4
// against the same red and passes every check. Both are existing tokens:
// ink.glow and stat.down. Raw hex because they feed inline styles.
const GAIN = "#3F4EE0";
const LOSS = "#C0392B";
const NO_CHANGE = 0.05; // under this many points a game, call it unchanged

const signed = (n, d = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`;
const colorFor = (n) => (n > NO_CHANGE ? GAIN : n < -NO_CHANGE ? LOSS : undefined);

// "doncic" has to find "Luka Dončić" -- a search that needs the diacritic
// finds nobody for the half of the league with an accented name.
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Tick values at a clean step, and a domain snapped to them so the bars and
// the axis agree. Always spans zero: it is the baseline every bar grows from.
function scale(values) {
  const rawLo = Math.min(0, ...values);
  const rawHi = Math.max(0, ...values);
  const span = rawHi - rawLo || 1;
  const raw = span / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= 5) ?? raw;
  const lo = Math.floor(rawLo / step) * step;
  let hi = Math.ceil(rawHi / step) * step;
  // Only widen when there is no range at all. Padding a one-sided scenario
  // past zero draws an empty positive region that implies a gain nobody got.
  if (hi === lo) hi = lo + step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks, pct: (v) => ((v - lo) / (hi - lo)) * 100 };
}

// ── Every team ───────────────────────────────────────────────────────────────
function TeamChart({ teams }) {
  const [active, setActive] = useState(null);
  const values = teams.map((t) => t.pts_change);
  const { ticks, pct } = useMemo(() => scale(values), [values.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const zero = pct(0);
  const hasGain = values.some((v) => v > NO_CHANGE);
  const hasLoss = values.some((v) => v < -NO_CHANGE);

  return (
    <div>
      {/* Legend: mirrors the marks -- rects for the bars, a line for the average. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink/70">
        {hasGain && <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: GAIN }} />Gains points</span>}
        {hasLoss && <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: LOSS }} />Loses points</span>}
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-[2px] bg-ink/50" />League average ({signed(avg)})</span>
      </div>

      <div className="grid grid-cols-[3.25rem_1fr] gap-x-3 sm:grid-cols-[10.5rem_1fr]" onPointerLeave={() => setActive(null)}>
        {teams.map((t, i) => {
          const v = t.pts_change;
          const x = pct(v);
          const left = Math.min(x, zero);
          const width = Math.abs(x - zero);
          const isEnd = i === 0 || i === teams.length - 1;
          // An end label goes inside a long bar (in white) and outside a short
          // one (in ink), so it is never clipped by its own mark.
          const inside = width > 22;
          const tip = v < 0
            ? (inside ? { left: `calc(${x}% + 6px)` } : { right: `calc(${100 - x}% + 6px)` })
            : (inside ? { right: `calc(${100 - x}% + 6px)` } : { left: `calc(${x}% + 6px)` });
          const vsAvg = v - avg;

          // pointermove, not pointerenter: React emulates enter/leave from
          // over/out pairs, and with the row split across two grid cells that
          // never set state at all -- verified, native pointerover fired and
          // nothing rendered. pointermove bubbles, and setting the same index
          // twice is a no-op. One pointerleave on the whole chart clears it.
          // Both cells take it, so the name is as good a target as the bar.
          const hover = { onPointerMove: () => setActive(i) };

          return (
            <div key={t.abbr} className="contents">
              <div {...hover} className={`flex h-[22px] items-center truncate text-xs ${active === i ? "font-semibold text-ink" : "text-ink/80"}`}>
                <span className="sm:hidden">{t.abbr}</span>
                <span className="hidden truncate sm:inline">{t.name}</span>
              </div>
              {/* The whole row is the hit target, not the 16px bar -- and it is
                  focusable, so the same readout reaches keyboard users. */}
              <div
                {...hover}
                tabIndex={0}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
                aria-label={`${t.name}: ${signed(v)} points per game, ${t.pts.toFixed(1)} to ${t.new_pts.toFixed(1)}`}
                className={`relative h-[22px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${active === i ? "bg-ink/[0.05]" : ""}`}
              >
                {/* Each row draws its own slice of the zero and average rules;
                    stacked, they read as two continuous lines. Solid, never
                    dashed -- a dashed rule reads as a gridline. */}
                <div className="absolute inset-y-0 w-px bg-ink/25" style={{ left: `${zero}%` }} />
                <div className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-ink/45" style={{ left: `${pct(avg)}%` }} />
                <div
                  className="absolute top-[3px] h-4"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: colorFor(v) ?? "transparent",
                    // 4px rounded at the data end, square at the baseline.
                    borderRadius: v < 0 ? "4px 0 0 4px" : "0 4px 4px 0",
                  }}
                />
                {isEnd && Math.abs(v) > NO_CHANGE && (
                  <span
                    className={`absolute top-[3px] text-[11px] font-semibold leading-4 tabular-nums ${inside ? "text-white" : "text-ink"}`}
                    style={tip}
                  >
                    {signed(v)}
                  </span>
                )}
                {active === i && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-[16rem] rounded-lg border border-ink/15 bg-paper px-3 py-2 text-left shadow-lg"
                    style={{ left: `min(${x}%, calc(100% - 12rem))` }}
                  >
                    <p className="text-base font-bold tabular-nums text-ink">{signed(v)} PPG</p>
                    <p className="text-xs font-medium text-ink/80">{t.name}</p>
                    <p className="text-xs tabular-nums text-ink/60">
                      {t.pts.toFixed(1)} → {t.new_pts.toFixed(1)} PPG · {Math.abs(vsAvg) < 0.01 ? "at" : `${Math.abs(vsAvg).toFixed(2)} ${vsAvg > 0 ? "better" : "worse"} than`} league avg
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Baseline, average, and ticks share one track so they line up with the bars. */}
        <div />
        <div className="relative mt-1 h-5 border-t border-ink/15">
          {ticks.map((tk) => (
            <span key={tk} className="absolute top-1 -translate-x-1/2 text-[10px] tabular-nums text-ink/55" style={{ left: `${pct(tk)}%` }}>
              {signed(tk, tk % 1 ? 1 : 0)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamTable({ teams }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Points per game change for every team</caption>
        <thead>
          <tr className="border-b border-ink/15 text-left text-xs text-ink/60">
            <th className="py-1.5 pr-3 font-medium">#</th>
            <th className="py-1.5 pr-3 font-medium">Team</th>
            <th className="py-1.5 pr-3 text-right font-medium">Now</th>
            <th className="py-1.5 pr-3 text-right font-medium">Change</th>
            <th className="py-1.5 text-right font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.abbr} className="border-b border-ink/10">
              <td className="py-1.5 pr-3 tabular-nums text-ink/50">{i + 1}</td>
              <td className="py-1.5 pr-3 text-ink">{t.name}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-ink/70">{t.pts.toFixed(1)}</td>
              <td className="py-1.5 pr-3 text-right font-semibold tabular-nums" style={{ color: colorFor(t.pts_change) }}>{signed(t.pts_change)}</td>
              <td className="py-1.5 text-right tabular-nums text-ink">{t.new_pts.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Any player, by search ────────────────────────────────────────────────────
// Deliberately not a list: the full league is several hundred rows nobody
// reads. Searching for the one player you care about is the fast path.
function PlayerSearch({ players, summary }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const needle = fold(q.trim());
    if (needle.length < 2) return [];
    const hits = players.filter((p) => fold(p.name).includes(needle));
    // A word that STARTS with the query ranks first ("james" -> LeBron James
    // over a name that merely contains it); ties keep the incoming order, which
    // is biggest-change first.
    const starts = (p) => fold(p.name).split(" ").some((w) => w.startsWith(needle));
    return [...hits].sort((a, b) => Number(starts(b)) - Number(starts(a))).slice(0, 6);
  }, [q, players]);

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search any of ${summary.players} players…`}
        className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/50 focus:border-terracotta focus:outline-none"
      />

      {q.trim().length < 2 ? (
        <p className="text-xs text-ink/60">
          {summary.gain} gain points, {summary.lose} lose points, {summary.players - summary.gain - summary.lose} are essentially unaffected.
          Search a name to see exactly how their scoring changes.
        </p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-ink/60">No player matches “{q.trim()}”.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {matches.map((p) => {
            const c = colorFor(p.pts_change);
            return (
              <div key={p.id} className="rounded-lg border border-ink/15 bg-paper-raised p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-semibold text-ink">{p.name}</p>
                  <p className="shrink-0 text-xs text-ink/60">{p.team} · {p.gp} GP</p>
                </div>
                {/* Stat-tile delta: signed, colored by direction. Both colors
                    clear 4.5:1 as text on this surface. */}
                <p className="mt-1 text-2xl font-bold" style={{ color: c }}>
                  {Math.abs(p.pts_change) < NO_CHANGE ? "No change" : `${signed(p.pts_change)} PPG`}
                </p>
                <p className="text-xs tabular-nums text-ink/70">{p.pts.toFixed(1)} → {p.new_pts.toFixed(1)} PPG</p>
                <p className="mt-1.5 text-xs text-ink/60">{p.detail}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RuleSimulator() {
  const [scenario, setScenario] = useState("no_corner_three");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState("chart");

  async function simulate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.simulateRule({ scenario }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">Rule Change Simulator</h1>
        <p className="mt-1 text-ink/70">
          The only public tool that models what NBA rule changes would actually do to teams and players.
        </p>
      </header>

      <div className="hoop-card-outline max-w-2xl p-6 space-y-4">
        <p className="hoop-stat-label">Select a rule change to simulate</p>
        <div className="grid gap-2">
          {SCENARIOS.map((s) => (
            <label key={s.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              scenario === s.value ? "border-terracotta/50 bg-terracotta/10" : "border-ink/20 hover:border-ink/20"
            }`}>
              <input
                type="radio"
                name="scenario"
                value={s.value}
                checked={scenario === s.value}
                onChange={() => setScenario(s.value)}
                className="accent-terracotta"
              />
              <span className="text-sm text-ink">{s.label}</span>
            </label>
          ))}
        </div>
        <button onClick={simulate} disabled={loading} className="hoop-btn-primary">
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Simulating…
            </span>
          ) : "Run Simulation"}
        </button>
      </div>

      {error && <p className="text-stat-down">{error}</p>}

      {result && (
        <div className="max-w-4xl space-y-5 animate-slide-up">
          <div className="hoop-card-outline p-4">
            <p className="text-lg font-bold text-ink mb-1">{result.label}</p>
            <p className="text-ink/70 text-sm">{result.description}</p>
          </div>

          <div className="hoop-card-outline p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="hoop-stat-label">Every team</p>
                <p className="text-xs text-ink/60">Change in points per game, {result.season}</p>
              </div>
              <div className="inline-flex rounded-lg border border-ink/15 p-0.5 text-xs font-semibold">
                {["chart", "table"].map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={`rounded-md px-3 py-1 capitalize transition ${view === v ? "bg-terracotta/15 text-terracotta" : "text-ink/60 hover:text-ink"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {view === "chart" ? <TeamChart teams={result.teams} /> : <TeamTable teams={result.teams} />}
          </div>

          <div className="hoop-card-outline p-5">
            <p className="hoop-stat-label mb-3">Any player</p>
            <PlayerSearch players={result.players} summary={result.summary} />
          </div>

          <div className="space-y-1 text-xs text-ink/50">
            <p>{result.methodology}</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {result.assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
