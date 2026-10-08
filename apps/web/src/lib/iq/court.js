/*
 * Court geometry for the Basketball IQ simulator.
 *
 * Shares the coordinate space the shot charts already use, so a position here
 * means the same thing it means there:
 *   x — 0..50 feet across the court width, 0 = left sideline
 *   y — feet out from the baseline, 0 = baseline
 *
 * Half court is 47ft deep. The hoop sits at (25, 5.25).
 */

export const COURT_W_FT = 50;
export const COURT_H_FT = 47;
export const FT = 6; // pixels per foot — matches components/ShotChart.jsx
export const COURT_W = COURT_W_FT * FT; // 300
export const COURT_H = COURT_H_FT * FT; // 282

// Real NBA dimensions. Approximating these is how you end up drawing a
// top-of-key three inside the arc, which makes every spacing read wrong.
export const HOOP = { x: 25, y: 5.25 };
export const RIM_R = 0.75;
export const ARC_R = 23.75; // three-point radius from the hoop centre
export const CORNER_X = 22; // corner straightaway, feet from centre
export const ARC_START_Y = 14.2; // where the straightaway meets the arc
export const PAINT_HALF = 8; // 16ft lane
export const PAINT_DEPTH = 19;
export const RESTRICTED_R = 4;

export const ftToPx = (ft) => ft * FT;
export const toPx = ({ x, y }) => ({ px: x * FT, py: y * FT });

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distToRim(p) {
  return dist(p, HOOP);
}

/** Is this spot behind the three-point line? Corners are the special case:
 *  the line runs straight at x = 25 +/- 22 until y = 14.2, so a corner shot
 *  can be a three at 22ft while a wing shot at 23ft is still a two. */
export function isThree(p) {
  if (p.y <= ARC_START_Y) return Math.abs(p.x - HOOP.x) >= CORNER_X;
  return distToRim(p) >= ARC_R;
}

export function inPaint(p) {
  return Math.abs(p.x - HOOP.x) <= PAINT_HALF && p.y <= PAINT_DEPTH;
}

/**
 * Perpendicular distance from `point` to the segment a->b, and whether the
 * nearest approach falls between the endpoints.
 *
 * This is how passing lanes are judged: a defender 2ft from the straight line
 * between passer and target is in the lane, but only if they are actually
 * BETWEEN them. A defender 2ft off the line's extension, standing behind the
 * passer, deflects nothing.
 */
export function distToSegment(point, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return { d: dist(point, a), t: 0 };
  let t = ((point.x - a.x) * vx + (point.y - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * vx, y: a.y + t * vy };
  return { d: dist(point, proj), t };
}

/** Closest defender to a player, in feet. */
export function nearestDefender(player, defenders) {
  let best = null;
  for (const d of defenders) {
    const gap = dist(player, d);
    if (!best || gap < best.gap) best = { defender: d, gap };
  }
  return best || { defender: null, gap: 99 };
}

// ── Named spots ─────────────────────────────────────────────────────────────
// Scenario setups reference these rather than raw numbers, so a "left corner"
// is the same place in every scenario and a reader can tell what a formation
// is supposed to look like without plotting it.

const onArc = (deg, r = ARC_R + 0.9) => ({
  // deg measured from straight-on (0 = top of key), positive to the right
  x: +(HOOP.x + r * Math.sin((deg * Math.PI) / 180)).toFixed(2),
  y: +(HOOP.y + r * Math.cos((deg * Math.PI) / 180)).toFixed(2),
});

export const SPOT = {
  rim: { x: 25, y: 5.25 },
  frontRim: { x: 25, y: 8 },
  lowBlockL: { x: 18, y: 8 },
  lowBlockR: { x: 32, y: 8 },
  shortCornerL: { x: 11, y: 6 },
  shortCornerR: { x: 39, y: 6 },
  dunkerL: { x: 20, y: 7 },
  dunkerR: { x: 30, y: 7 },
  elbowL: { x: 17, y: 19 },
  elbowR: { x: 33, y: 19 },
  freeThrow: { x: 25, y: 19 },
  nail: { x: 25, y: 19 },
  highPostL: { x: 21, y: 17 },
  highPostR: { x: 29, y: 17 },
  midL: { x: 14, y: 17 },
  midR: { x: 36, y: 17 },
  topKey: { x: 25, y: 24 },
  // Three-point spots
  top3: onArc(0),
  slotL3: onArc(-22),
  slotR3: onArc(22),
  wingL3: onArc(-42),
  wingR3: onArc(42),
  cornerL3: { x: 2.6, y: 8 },
  cornerR3: { x: 47.4, y: 8 },
  deepTop3: onArc(0, ARC_R + 4),
  // Backcourt / transition
  logo: { x: 25, y: 38 },
  halfL: { x: 12, y: 44 },
  halfR: { x: 38, y: 44 },
  inbound: { x: 25, y: 1 },
};

/** A defender positioned `gap` feet from their man, on the hoop side by
 *  default — the normal shape of on-ball defence. */
export function guarding(man, gap = 3, bias = "hoop") {
  if (bias === "hoop") {
    const d = distToRim(man) || 1;
    return {
      x: +(man.x + ((HOOP.x - man.x) / d) * gap).toFixed(2),
      y: +(man.y + ((HOOP.y - man.y) / d) * gap).toFixed(2),
    };
  }
  return { x: man.x, y: Math.max(0, man.y - gap) };
}

/** A defender shaded `shift` feet toward a point — how help defence is set. */
export function shadedToward(man, toward, shift) {
  const d = dist(man, toward) || 1;
  return {
    x: +(man.x + ((toward.x - man.x) / d) * shift).toFixed(2),
    y: +(man.y + ((toward.y - man.y) / d) * shift).toFixed(2),
  };
}
