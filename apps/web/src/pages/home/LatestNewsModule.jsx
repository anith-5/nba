function FeaturedCard({ scoringLeader }) {
  const [name, team, ppg] = scoringLeader;
  return (
    <div className="hoop-card p-5">
      <p className="hoop-stat-label text-paper/70">Scoring Leader</p>
      <p className="mt-2 font-hoop text-2xl font-bold leading-tight">{name}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-hoop text-4xl font-bold">{ppg}</span>
        <span className="text-sm text-paper/70">PPG · {team}</span>
      </div>
    </div>
  );
}

function SmallCard({ title, rows, unit, note, id }) {
  return (
    <div className="hoop-card-outline p-4" id={id}>
      <p className="hoop-stat-label">{title}</p>
      {note && <p className="mt-0.5 text-[11px] text-ink/60">{note}</p>}
      <ul className="mt-2 space-y-1.5">
        {rows.slice(0, 3).map((r, i) => (
          <li key={r[0]} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-ink">
              {i + 1}. {r[0]}
            </span>
            <span className="shrink-0 font-semibold text-terracotta">
              {r[2]}
              {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Reuses the exact same scoring/clutch/standings data Home.jsx already
// fetches (live api.standings() with the existing hardcoded fallback) --
// this is a repackaging of real data into the new card-stack format, not a
// second, separate "news" data source.
//
// No nested scroll box and no outer bordered panel wrapping the whole
// module -- both were making this read as its own separate boxed-in
// component sitting on the page rather than content that's actually part
// of the page. The cards now sit directly in normal page flow (real page
// scroll, no inner overflow-y-auto), and there's no single hard-edged
// container around the group -- just the individual cards, the same way
// any other section of the page would render.
export default function LatestNewsModule({ scoring, clutch, standings, season }) {
  // Best records league-wide, most wins first. This card previously showed the
  // West alone, which hid teams with better records than the ones it listed:
  // Detroit finished 60-22, third-best in the league, and never appeared
  // because it plays in the East. Ties break on fewer losses.
  const bestRecords = [...standings.East, ...standings.West]
    .sort(([, , aWins, aLosses], [, , bWins, bLosses]) => bWins - aWins || aLosses - bLosses)
    .map(([tri, name, w, l]) => [`${name} (${tri})`, null, `${w}-${l}`]);

  return (
    <div className="space-y-4">
      <p className="hoop-stat-label px-1">Latest</p>
      <FeaturedCard scoringLeader={scoring[0]} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SmallCard title="Leaders" rows={scoring} unit=" PPG" />
        <SmallCard
          id="standings"
          title="Best Records"
          note={season ? `${season} final` : undefined}
          rows={bestRecords}
          unit=""
        />
        <SmallCard title="Clutch Leaders" rows={clutch} unit=" CLU" />
      </div>
    </div>
  );
}
