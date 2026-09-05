import { BLUE, GRID, INK, ORANGE, RADAR_AXES } from "../lib/compTheme.js";

/*
 * Shared six-axis stat hexagon.
 *
 * Extracted from the Draft Prospect Comps card so Head-to-Head renders in
 * exactly the same visual language rather than a second, separately-drawn
 * chart — the same reason ShotChart.jsx was pulled out of that page.
 *
 * `a` is drawn as a filled polygon, `b` as a dashed outline, and each axis
 * label carries both values stacked in the matching color. Both take
 * `{ radar: {scoring, efficiency, playmaking, rebounding, defense, shooting} }`;
 * `b` is optional, so a one-sided chart still renders.
 */

const CX = 175;
const CY = 172;
const R = 104;

// Axis i sits at -90° + 60i, so the first point is straight up and the six
// land on a regular hexagon.
function pt(i, n) {
  const a = (-90 + i * 60) * (Math.PI / 180);
  return [CX + n * R * Math.cos(a), CY + n * R * Math.sin(a)];
}

function poly(radar) {
  return RADAR_AXES.map((ax, i) => pt(i, ax.norm(radar?.[ax.key] ?? 0)).join(",")).join(" ");
}

export default function StatRadar({ a, b, aColor = BLUE, bColor = ORANGE }) {
  const aRadar = a?.radar;
  const bRadar = b?.radar;

  return (
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
        const anchor = Math.abs(lx - CX) < 8 ? "middle" : lx > CX ? "start" : "end";
        return (
          <g key={ax.key}>
            <line x1={CX} y1={CY} x2={x} y2={y} stroke={GRID} strokeWidth="1" />
            <text x={lx} y={ly - 6} textAnchor={anchor} fontSize="11" fontWeight="700" fill={INK}>{ax.label}</text>
            {aRadar && (
              <text x={lx} y={ly + 6} textAnchor={anchor} fontSize="10" fill={aColor}>{ax.fmt(aRadar[ax.key])}</text>
            )}
            {bRadar && (
              <text x={lx} y={ly + 18} textAnchor={anchor} fontSize="10" fill={bColor}>{ax.fmt(bRadar[ax.key])}</text>
            )}
          </g>
        );
      })}
      {/* b polygon (dashed outline) */}
      {bRadar && (
        <polygon points={poly(bRadar)} fill="none" stroke={bColor} strokeWidth="2" strokeDasharray="5 4" />
      )}
      {/* a polygon (solid fill) — drawn last so it reads as the foreground */}
      {aRadar && (
        <polygon points={poly(aRadar)} fill={aColor} fillOpacity="0.32" stroke={aColor} strokeWidth="2" />
      )}
    </svg>
  );
}
