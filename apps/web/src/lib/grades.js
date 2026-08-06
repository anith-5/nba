// Shared letter-grade color scale (A+ → F), monochrome black/red/white:
// good = bright white, fading to gray, bad = red.
const MAP = {
  a: { text: "text-white", ring: "ring-white/25", bg: "bg-white/10" },
  b: { text: "text-zinc-200", ring: "ring-white/15", bg: "bg-white/5" },
  c: { text: "text-zinc-400", ring: "ring-white/10", bg: "bg-white/5" },
  d: { text: "text-brand-glow", ring: "ring-brand/30", bg: "bg-brand/10" },
  f: { text: "text-brand", ring: "ring-brand/40", bg: "bg-brand/15" },
  na: { text: "text-zinc-400", ring: "ring-white/10", bg: "bg-white/5" },
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
const HEX = { a: "#FAFAFA", b: "#D4D4D8", c: "#A1A1AA", d: "#F87171", f: "#EF4444", na: "#A1A1AA" };

export function gradeHex(grade) {
  return HEX[gradeTier(grade)];
}
