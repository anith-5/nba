/*
 * Court zones for the head-to-head zone shot chart.
 *
 * The court is partitioned into ten regions and every field-goal attempt is
 * assigned to exactly one of them. Crucially, the CLASSIFIER and the DRAWN
 * POLYGONS below are derived from the same handful of constants, so a shot can
 * never be counted in one zone while landing inside another zone's outline.
 *
 * Coordinate spaces (both used here, deliberately):
 *   feet — what the API sends per shot: x 0..50 across the court width,
 *          y in feet out from the baseline. Used by the classifier.
 *   px   — the space components/ShotChart.jsx draws in: 300 x 282 at 6px per
 *          foot, same origin. Used by the paths.
 *
 * Zone boundaries follow the NBA court itself rather than an arbitrary grid:
 * the restricted-area circle, the paint, the three-point line, and two rays
 * from the hoop through the paint's top corners (which is what separates a
 * wing look from a straight-on one at ~30 degrees).
 */

// ── Geometry, in feet ────────────────────────────────────────────────────────
const HOOP_X = 25;
const HOOP_Y = 5.25;      // hoop centre, feet from the baseline
const RA_R = 4;           // restricted-area radius
const PAINT_HALF = 8;     // NBA paint is 16ft wide
const PAINT_DEPTH = 19;   // ...and 19ft from the baseline
const CORNER_Y = 14.2;    // where the corner straightaway meets the arc

// Slope (dx/dy from the hoop) of the ray through the paint's top corner. This
// one number splits left / centre / right on BOTH sides of the three-point
// line, so the wedges line up across it instead of kinking at the arc.
const RAY = PAINT_HALF / (PAINT_DEPTH - HOOP_Y); // 8 / 13.75 ≈ 0.5818

// ── Zones ────────────────────────────────────────────────────────────────────
// Order matters: it is the order the legend and any list of zones reads in.
export const ZONES = [
  { id: "ra", label: "Restricted Area" },
  { id: "paint", label: "Paint (Non-RA)" },
  { id: "mid_left", label: "Mid-Range Left" },
  { id: "mid_center", label: "Mid-Range Centre" },
  { id: "mid_right", label: "Mid-Range Right" },
  { id: "corner3_left", label: "Left Corner 3" },
  { id: "corner3_right", label: "Right Corner 3" },
  { id: "wing3_left", label: "Left Wing 3" },
  { id: "top3", label: "Top of Key 3" },
  { id: "wing3_right", label: "Right Wing 3" },
];

/**
 * Which zone a shot belongs to. `value` (2 or 3) comes straight from NBA's
 * SHOT_TYPE, so the two/three split is theirs, not a re-derivation of the arc
 * that could disagree with it on a shot taken right on the line.
 */
export function classifyShot(s) {
  const dx = s.x - HOOP_X;
  const dy = s.y - HOOP_Y;

  if (s.value === 3) {
    // Below where the straightaway meets the arc, a three is a corner three —
    // there is no "wing" that low on the floor.
    if (s.y <= CORNER_Y) return dx < 0 ? "corner3_left" : "corner3_right";
    if (dx <= -RAY * dy) return "wing3_left";
    if (dx >= RAY * dy) return "wing3_right";
    return "top3";
  }

  if (Math.hypot(dx, dy) <= RA_R) return "ra";
  if (Math.abs(dx) <= PAINT_HALF && s.y <= PAINT_DEPTH) return "paint";

  // Outside the paint. dy <= 0 means level with or behind the hoop, where the
  // ray test is meaningless — those are baseline shots, split by side.
  if (dy <= 0) return dx < 0 ? "mid_left" : "mid_right";
  if (dx <= -RAY * dy) return "mid_left";
  if (dx >= RAY * dy) return "mid_right";
  return "mid_center";
}

/** Per-zone {made, attempts, pct} for one player's shots. pct is null at 0 attempts. */
export function zoneTotals(shots) {
  const out = {};
  for (const z of ZONES) out[z.id] = { made: 0, attempts: 0, pct: null };
  for (const s of shots || []) {
    const t = out[classifyShot(s)];
    t.attempts += 1;
    t.made += s.made ? 1 : 0;
  }
  for (const z of ZONES) {
    const t = out[z.id];
    t.pct = t.attempts ? t.made / t.attempts : null;
  }
  return out;
}

// ── The same geometry in px, for the drawn outlines ──────────────────────────
const FT = 6;
const hx = HOOP_X * FT;           // 150
const hy = HOOP_Y * FT;           // 31.5
const raR = RA_R * FT;            // 24
const pL = hx - PAINT_HALF * FT;  // 102
const pR = hx + PAINT_HALF * FT;  // 198
const pD = PAINT_DEPTH * FT;      // 114
const arcR = 23.75 * FT;          // 142.5
const cX = 22 * FT;               // 132  → corner line at x = 18 / 282
const cL = hx - cX;               // 18
const cR = hx + cX;               // 282
const cY = CORNER_Y * FT;         // 85.2
const W = 300;
const H = 282;

// Where the paint-corner ray crosses the three-point arc, and where it leaves
// the top of the drawn court. Computed rather than hardcoded so a change to the
// constants above moves the outlines and the classifier together.
const rayLen = Math.hypot(PAINT_HALF * FT, pD - hy);
const ux = -(PAINT_HALF * FT) / rayLen;
const uy = (pD - hy) / rayLen;
const aLx = +(hx + arcR * ux).toFixed(2);      // 78.34
const aLy = +(hy + arcR * uy).toFixed(2);      // 154.67
const aRx = +(hx - arcR * ux).toFixed(2);      // 221.66
const eLx = +(hx + ((H - hy) / uy) * ux).toFixed(2); // 4.26 — ray at the top edge
const eRx = +(hx - ((H - hy) / uy) * ux).toFixed(2); // 295.74

// Arc sweep flags: 1 runs clockwise on screen (y is down), 0 counter-clockwise.
// Each segment below is the shortest way round between its two endpoints.
export const ZONE_PATHS = {
  // The restricted area is the only zone that is a plain circle.
  ra: `M ${hx + raR} ${hy} A ${raR} ${raR} 0 1 1 ${hx - raR} ${hy} A ${raR} ${raR} 0 1 1 ${hx + raR} ${hy} Z`,
  // Paint with the restricted area punched out — needs fill-rule evenodd.
  paint: `M ${pL} 0 H ${pR} V ${pD} H ${pL} Z `
       + `M ${hx + raR} ${hy} A ${raR} ${raR} 0 1 1 ${hx - raR} ${hy} A ${raR} ${raR} 0 1 1 ${hx + raR} ${hy} Z`,
  mid_left: `M ${cL} 0 H ${pL} V ${pD} L ${aLx} ${aLy} A ${arcR} ${arcR} 0 0 1 ${cL} ${cY} Z`,
  mid_center: `M ${pL} ${pD} L ${aLx} ${aLy} A ${arcR} ${arcR} 0 0 0 ${aRx} ${aLy} L ${pR} ${pD} Z`,
  mid_right: `M ${cR} 0 H ${pR} V ${pD} L ${aRx} ${aLy} A ${arcR} ${arcR} 0 0 0 ${cR} ${cY} Z`,
  corner3_left: `M 0 0 H ${cL} V ${cY} H 0 Z`,
  corner3_right: `M ${cR} 0 H ${W} V ${cY} H ${cR} Z`,
  wing3_left: `M 0 ${cY} H ${cL} A ${arcR} ${arcR} 0 0 0 ${aLx} ${aLy} L ${eLx} ${H} H 0 Z`,
  top3: `M ${aLx} ${aLy} A ${arcR} ${arcR} 0 0 0 ${aRx} ${aLy} L ${eRx} ${H} H ${eLx} Z`,
  wing3_right: `M ${W} ${cY} H ${cR} A ${arcR} ${arcR} 0 0 1 ${aRx} ${aLy} L ${eRx} ${H} H ${W} Z`,
};

// Hand-placed so every label sits in open floor inside its own zone and no two
// collide. The corner-three strip is only 3ft wide, so its label is nudged
// inward to stay within the viewBox — the same overflow a printed zone chart
// uses rather than shrinking the type to fit.
export const ZONE_LABELS = {
  ra: [hx, 22],
  paint: [hx, 95],
  mid_left: [60, 60],
  mid_center: [hx, 138],
  mid_right: [240, 60],
  corner3_left: [24, 32],
  corner3_right: [276, 32],
  wing3_left: [32, 190],
  top3: [hx, 215],
  wing3_right: [268, 190],
};
