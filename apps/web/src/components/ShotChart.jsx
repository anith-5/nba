import { useMemo } from "react";

/*
 * Shared half-court hexbin shot chart.
 *
 * Extracted from the Draft Prospect Comps card so the regular-player shot
 * chart (Shot Quality) renders in exactly the same visual language rather
 * than a second, separately-drawn court.
 *
 * Coordinate convention (one space for every shot source in the app):
 *   x — 0..50, feet across the court width, 0 = left sideline
 *   y — feet out from the baseline, 0 = baseline
 *
 * College prospect shots arrive in this space already (ESPN play-by-play).
 * NBA shots are normalised into it server-side, since ShotChartDetail gives
 * LOC_X/LOC_Y in tenths of a foot measured from the centre of the hoop —
 * see services/api/app/routers/shot_quality.py.
 */

// ESPN coords: x 0–50 (court width), y = feet from baseline.
export const COURT_W = 300;
export const COURT_H = 282;
export const FT = 6; // px per foot

// Court lines are ink @22%; bins are stroked in paper so adjacent ones read
// apart. Both mirror tailwind.config.js — raw hex because these feed SVG
// stroke/fill attributes, which don't pick up Tailwind tokens.
export const COURT_LINE = "rgba(36,49,196,0.22)";
const BIN_GAP = "#F2F1EA";

// Court geometry per source, in feet. `hoop` is the hoop's distance from the
// baseline; `arcR`/`corner`/`arcStart` describe the three-point line (corner
// straightaways at ±`corner` running out to `arcStart`, then an `arcR` arc).
//
// The college numbers reproduce what the draft-comp chart already drew. The
// NBA numbers are the real ones — without them a top-of-key three (29ft from
// the baseline) would render INSIDE a 31ft college arc and read as a long two.
// `paint` is the lane's HALF-width in feet. It was previously hardcoded to 6
// for both courts; the NBA lane is 16ft wide, so an NBA chart drew a lane 4ft
// too narrow. It lives in the config now because the zone chart partitions the
// floor along the lane's edge (lib/shotZones.js) and the two views of the same
// court have to agree on where that edge is. The college value is left as it
// was rather than changed under an unrelated feature.
export const COLLEGE_COURT = { hoop: 4, arcR: 22, corner: 22, arcStart: 9, paint: 6 };
export const NBA_COURT = { hoop: 5.25, arcR: 23.75, corner: 22, arcStart: 14.2, paint: 8 };

// Baseline is py 0 and the panel is exactly 47ft deep (282px / 6px-per-ft), so
// shots and court markings share one origin.
//
// This previously added a flat +24px to every shot while drawing the paint and
// arc from py 0 — a 4ft offset between the shot cloud and the lines it's meant
// to sit on, which put at-rim attempts below the restricted area. The hoop
// marker carried the same +24 so it looked self-consistent and the mismatch
// was easy to miss.
function courtToPx(s) {
  return { px: (s.x / 50) * COURT_W, py: s.y * FT };
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

/**
 * One half-court panel. `shots` is [{x, y}, …]; octagon area scales with how
 * many shots fall in that bin, so the chart reads as shot frequency.
 */
export default function ShotChart({
  shots,
  color,
  label,
  made,
  attempts,
  court = COLLEGE_COURT,
  className = "flex-1",
}) {
  const r = 11;
  const bins = useMemo(() => hexbin(shots || [], r), [shots]);
  const max = Math.max(1, ...bins.map((b) => b.count));
  const hoopX = (25 / 50) * COURT_W, hoopY = court.hoop * FT;
  const pct = attempts ? ((made / attempts) * 100).toFixed(0) : null;
  const cornerX = court.corner * FT, arcR = court.arcR * FT, arcY = court.arcStart * FT;
  const paintHalf = (court.paint ?? 6) * FT;

  return (
    <div className={className}>
      {label && (
        <p className="mb-1 text-center text-xs font-semibold" style={{ color }}>
          {label}
          {attempts ? ` · ${made}/${attempts} (${pct}% FG)` : ""}
        </p>
      )}
      <svg viewBox={`0 0 ${COURT_W} ${COURT_H}`} className="w-full">
        {/* court outline */}
        <rect x="1" y="1" width={COURT_W - 2} height={COURT_H - 2} fill="none" stroke={COURT_LINE} strokeWidth="1.5" />
        {/* paint */}
        <rect x={hoopX - paintHalf} y="0" width={paintHalf * 2} height={19 * FT} fill="none" stroke={COURT_LINE} strokeWidth="1.2" />
        {/* 3pt line: corner straightaways, then the arc */}
        <path d={`M ${hoopX - cornerX} 0 L ${hoopX - cornerX} ${arcY} A ${arcR} ${arcR} 0 0 0 ${hoopX + cornerX} ${arcY} L ${hoopX + cornerX} 0`}
          fill="none" stroke={COURT_LINE} strokeWidth="1.2" />
        {/* hoop */}
        <circle cx={hoopX} cy={hoopY} r="4" fill="none" stroke={COURT_LINE} strokeWidth="1.5" />
        {/* binned octagons — size (area) scales with shot frequency */}
        {bins.map((b, i) => {
          const rad = 2.5 + (r * 0.95 - 2.5) * Math.sqrt(b.count / max);
          return (
            <polygon key={i} points={octagonPoints(b.cx, b.cy, rad)}
              fill={color} fillOpacity={(0.28 + 0.72 * (b.count / max)).toFixed(2)}
              stroke={BIN_GAP} strokeWidth="0.5" />
          );
        })}
      </svg>
    </div>
  );
}
