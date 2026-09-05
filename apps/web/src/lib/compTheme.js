/*
 * Shared palette for the two side-by-side comparison features (Draft Prospect
 * Comps and Head-to-Head), so a matchup reads the same in both.
 *
 * Series A = ink blue (solid fill), series B = terracotta (dashed outline) —
 * the app's own tokens. Identity never rests on color alone: the two series
 * also differ in fill vs dashed stroke.
 *
 * These are raw hex rather than Tailwind classes because they feed SVG
 * fill/stroke attributes, so they don't pick up token changes automatically —
 * keep them in step with tailwind.config.js by hand. Every value below is
 * chosen for contrast against paper (#F2F1EA): labels land ~8:1, the two
 * series and secondary text ~5:1, all comfortably above the 4.5:1 floor at
 * the 10–11px sizes these charts draw.
 */
export const INK = "#2431C4";     // ink — primary labels (axis names, player names)
export const SUBINK = "#4A52B8";  // muted ink — secondary / caption text
export const BLUE = "#3F4EE0";    // ink-glow — series A
export const ORANGE = "#9E4A30";  // terracotta-dim — series B
export const GRID = "rgba(36,49,196,0.22)";  // ink @22% — rings, spokes, court lines
export const TRACK = "rgba(36,49,196,0.12)"; // percentile / delta bar track

export const clamp01 = (x) => Math.max(0, Math.min(1, x));

/*
 * The six radar axes: label, value formatter, and 0–1 normalization for the
 * plot. Shared so a head-to-head hexagon is literally the same chart as a
 * draft comp hexagon, not a lookalike that can drift.
 *
 * Formatters return an em dash for a missing value rather than printing
 * "undefined": pre-1973 seasons have no steals or blocks recorded, and
 * pre-1979 ones no three-point line, so those axes are legitimately empty.
 */
export const RADAR_AXES = [
  { key: "scoring", label: "Scoring", fmt: (v) => (v == null ? "—" : `${v.toFixed(1)} PPG`), norm: (v) => clamp01(v / 28) },
  { key: "efficiency", label: "Efficiency", fmt: (v) => (v == null ? "—" : `${Math.round(v * 100)} TS%`), norm: (v) => clamp01((v - 0.45) / 0.25) },
  { key: "playmaking", label: "Playmaking", fmt: (v) => (v == null ? "—" : `${v.toFixed(1)} APG`), norm: (v) => clamp01(v / 8) },
  { key: "rebounding", label: "Rebounding", fmt: (v) => (v == null ? "—" : `${v.toFixed(1)} RPG`), norm: (v) => clamp01(v / 12) },
  { key: "defense", label: "Defense", fmt: (v) => (v == null ? "—" : `${v.toFixed(1)} STL+BLK`), norm: (v) => clamp01(v / 4) },
  { key: "shooting", label: "Shooting", fmt: (v) => (v == null ? "—" : `${Math.round(v * 100)}% 3P`), norm: (v) => clamp01((v - 0.25) / 0.25) },
];
