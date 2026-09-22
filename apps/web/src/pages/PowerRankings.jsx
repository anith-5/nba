import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";

// Diverging pair for "above / below league average". Validated against the
// paper surface: both clear the chroma floor and 4.5:1 contrast. Their CVD
// separation sits in the 6-8 band, which is only legal with secondary
// encoding -- so every bar also diverges left/right from a centre line and
// carries its signed value as a label. A red/green reader who sees no colour
// difference still gets direction and sign.
const ABOVE = "#257C56";
const BELOW = "#C0392B";

const FACTORS = [
  { key: "shooting", label: "Shooting", short: "eFG", weight: 0.4, hint: "Effective FG% minus opponent eFG%" },
  { key: "turnovers", label: "Turnovers", short: "TOV", weight: 0.25, hint: "Opponent turnover rate minus own turnover rate" },
  { key: "rebounding", label: "Rebounding", short: "REB", weight: 0.2, hint: "Offensive rebound % minus opponent offensive rebound %" },
  { key: "free_throws", label: "Free throws", short: "FT", weight: 0.15, hint: "FTA per FGA minus the opponent's" },
];

const SORTS = [
  { key: "strength", label: "Strength" },
  { key: "projection", label: "Projection" },
  { key: "wins", label: "Record" },
];

const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// A bar that grows left or right from a shared centre. Position carries the
// sign independently of colour; the value is always labelled.
function DivergingBar({ value, max, width = 132 }) {
  const half = width / 2;
  const span = max > 0 ? Math.min(1, Math.abs(value) / max) : 0;
  const len = Math.max(value === 0 ? 0 : 2, span * half);
  const positive = value >= 0;
  return (
    <svg width={width} height={16} className="overflow-visible" aria-hidden="true">
      {/* League average. This line is load-bearing, not decoration: the red/green
          pair sits in the CVD floor band, so "which side of centre" is what
          carries the sign for a colour-blind reader. It has to be visible. */}
      <line x1={half} y1={0} x2={half} y2={16} stroke="currentColor" strokeWidth="1.5" className="text-ink/45" />
      <rect
        x={positive ? half : half - len}
        y={4}
        width={len}
        height={8}
        rx={2}
        fill={positive ? ABOVE : BELOW}
      />
    </svg>
  );
}

// Rank within one of the four factors. The number is the label; the tint only
// reinforces it, so the cell still reads with no colour at all.
function FactorCell({ rank, z, label, team }) {
  const strong = z >= 0;
  const weight = Math.min(1, Math.abs(z) / 2);
  return (
    <td className="px-1.5 py-2 text-center">
      <span
        title={`${team} — ${label}: ${rank} of 30 (${z > 0 ? "+" : ""}${z.toFixed(2)} SD vs league average)`}
        className="inline-block min-w-[26px] cursor-help rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums text-ink"
        style={{
          backgroundColor: `${strong ? ABOVE : BELOW}${Math.round(weight * 40 + 12)
            .toString(16)
            .padStart(2, "0")}`,
        }}
      >
        {rank}
      </span>
    </td>
  );
}

export default function PowerRankings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("strength");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .powerRankings()
      .then(setData)
      .catch((e) => setError(e.message || "Could not load power rankings."));
  }, []);

  const teams = useMemo(() => {
    const rows = data?.teams ? [...data.teams] : [];
    rows.sort((a, b) =>
      sort === "wins" ? b.wins - a.wins || b.strength - a.strength : b[sort] - a[sort],
    );
    const q = fold(query.trim());
    return q
      ? rows.filter((t) => fold(t.name).includes(q) || fold(t.tri).includes(q))
      : rows;
  }, [data, sort, query]);

  const maxStrength = useMemo(
    () => Math.max(1, ...(data?.teams || []).map((t) => Math.abs(t.strength))),
    [data],
  );

  if (error) {
    return (
      <div className="animate-fade-in max-w-2xl">
        <h1 className="text-3xl font-bold text-ink">Power Rankings</h1>
        <p className="mt-3 text-ink/70">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="animate-fade-in max-w-2xl">
        <h1 className="text-3xl font-bold text-ink">Power Rankings</h1>
        <p className="mt-3 text-ink/70">Loading team ratings…</p>
      </div>
    );
  }

  const flagged = (data.teams || []).filter((t) => t.continuity_flag).length;

  return (
    <div className="animate-fade-in space-y-6">
      <header className="max-w-3xl">
        <p className="hoop-stat-label">
          {data.season}
          {data.is_prior_season ? " final" : " in progress"}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-ink">Power Rankings</h1>
        <p className="mt-2 text-ink/70">
          <strong className="font-semibold text-ink">Strength</strong> is margin of victory
          adjusted for who each team played and where — points better than an average team,
          at a neutral site. <strong className="font-semibold text-ink">Projection</strong> is
          the Four Factors weighting of shooting, turnovers, rebounding and free throws, each
          measured against what the team allowed.
        </p>
        <p className="mt-2 text-sm text-ink/60">
          They answer different questions, so they disagree. The Four Factors settle down
          faster than results do, so a team projecting well above its strength has been losing
          games its underlying play did not deserve to lose.
        </p>
      </header>

      {/* Filters in one row above the table. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border-2 border-ink p-1">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                sort === s.key ? "bg-ink text-paper" : "text-ink/60 hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="text"
          placeholder="Filter teams…"
          aria-label="Filter teams"
          className="hoop-input w-48 px-3 py-2"
        />
        <div className="ml-auto flex items-center gap-4 text-xs text-ink/60">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: ABOVE }} />
            above average
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: BELOW }} />
            below average
          </span>
        </div>
      </div>

      <div className="hoop-card-outline overflow-x-auto p-0">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-ink text-left">
              <th className="px-3 py-2.5 font-semibold text-ink">#</th>
              <th className="px-3 py-2.5 font-semibold text-ink">Team</th>
              <th className="px-3 py-2.5 font-semibold text-ink">Record</th>
              <th className="px-3 py-2.5 font-semibold text-ink">Strength</th>
              <th className="px-3 py-2.5 text-right font-semibold text-ink">SOS</th>
              <th className="px-3 py-2.5 text-right font-semibold text-ink">Net</th>
              <th className="px-3 py-2.5 text-right font-semibold text-ink">Proj.</th>
              {FACTORS.map((f) => (
                <th
                  key={f.key}
                  title={`${f.hint} — weighted ${Math.round(f.weight * 100)}%`}
                  className="px-1.5 py-2.5 text-center font-semibold text-ink"
                >
                  {f.short}
                  <span className="block text-[10px] font-normal text-ink/50">
                    {Math.round(f.weight * 100)}%
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.tri} className="border-b border-ink/10 last:border-0 hover:bg-ink/[0.03]">
                <td className="px-3 py-2 tabular-nums text-ink/60">{t.rank}</td>
                <td className="px-3 py-2">
                  <span className="font-semibold text-ink">{t.name}</span>
                  <span className="ml-1.5 text-xs text-ink/50">{t.tri}</span>
                  {t.continuity_flag && (
                    <span
                      title={`Only ${Math.round(t.continuity * 100)}% of last season's minutes are still on this roster — this rating describes a team that has substantially changed.`}
                      className="ml-1.5 cursor-help rounded border border-terracotta/50 px-1 text-[10px] font-semibold uppercase text-terracotta-dim"
                    >
                      roster
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums text-ink/70">
                  {t.wins}-{t.losses}
                </td>
                <td className="px-3 py-2">
                  <div
                    className="flex items-center gap-2"
                    title={`${t.name}: ${t.strength > 0 ? "+" : ""}${t.strength.toFixed(2)} points vs an average team at a neutral site (margin ${t.mov > 0 ? "+" : ""}${t.mov.toFixed(2)}, schedule ${t.sos > 0 ? "+" : ""}${t.sos.toFixed(2)})`}
                  >
                    <DivergingBar value={t.strength} max={maxStrength} />
                    <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-ink">
                      {t.strength > 0 ? "+" : ""}
                      {t.strength.toFixed(2)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink/60">
                  {t.sos > 0 ? "+" : ""}
                  {t.sos.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink/60">
                  {t.net_rating > 0 ? "+" : ""}
                  {t.net_rating.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="font-semibold tabular-nums text-ink">
                    {t.projection > 0 ? "+" : ""}
                    {t.projection.toFixed(2)}
                  </span>
                  <span className="ml-1 text-xs text-ink/50">#{t.projection_rank}</span>
                </td>
                {FACTORS.map((f) => (
                  <FactorCell
                    key={f.key}
                    rank={t.factors[f.key].rank}
                    z={t.factors[f.key].z}
                    label={f.label}
                    team={t.name}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="max-w-3xl space-y-1.5 text-xs text-ink/60">
        <p>
          The four right-hand columns are each team&apos;s rank (1 best, 30 worst) in that
          factor, measured as a differential against what it allowed. Their weights are Dean
          Oliver&apos;s — shooting 40%, turnovers 25%, rebounding 20%, free throws 15%.
        </p>
        <p>
          <strong className="font-semibold text-ink">SOS</strong> is schedule strength in
          points, and it is not added on top of Strength — the opponent adjustment already
          contains it. It is shown so you can see who earned their record the hard way.
        </p>
        {flagged > 0 && (
          <p>
            <strong className="font-semibold text-ink">Roster</strong> marks the{" "}
            {flagged === 1 ? "team" : `${flagged} teams`} keeping under{" "}
            {Math.round(0.7 * 100)}% of last season&apos;s minutes. These ratings describe the
            team that played the games, and offseason moves are not reflected in them.
          </p>
        )}
      </div>
    </div>
  );
}
