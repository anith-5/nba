// Shared letter-grade color scale (A+ → F) on the paper/ink system: good runs
// green, the middle stays neutral ink, bad runs red. The legacy version ran
// white → grey → red, which worked on black but flattens on paper (white text
// vanishes, and the D/F reds were only a shade apart), so the ends are
// anchored to the stat-up/stat-down pair instead.
const MAP = {
  a: { text: "text-stat-up", ring: "ring-stat-up/40", bg: "bg-stat-up/10" },
  b: { text: "text-ink", ring: "ring-ink/25", bg: "bg-ink/10" },
  c: { text: "text-ink/70", ring: "ring-ink/15", bg: "bg-ink/5" },
  d: { text: "text-basketball-dim", ring: "ring-basketball/40", bg: "bg-basketball/10" },
  f: { text: "text-stat-down", ring: "ring-stat-down/40", bg: "bg-stat-down/10" },
  na: { text: "text-ink/60", ring: "ring-ink/15", bg: "bg-ink/5" },
};

export function gradeTier(grade) {
  const c = String(grade || "").trim().charAt(0).toUpperCase();
  return { A: "a", B: "b", C: "c", D: "d", F: "f" }[c] || "na";
}

export function gradeClasses(grade) {
  return MAP[gradeTier(grade)];
}

// Hex equivalents — for contexts that need a raw color (e.g. the share card,
// which uses inline styles for reliable image capture).
// Must stay in step with MAP above: stat-up green, ink, muted ink, basketball
// dim, stat-down red.
const HEX = { a: "#2F7D5B", b: "#2431C4", c: "#6B72D8", d: "#C6672E", f: "#C0392B", na: "#6B72D8" };

export function gradeHex(grade) {
  return HEX[gradeTier(grade)];
}
