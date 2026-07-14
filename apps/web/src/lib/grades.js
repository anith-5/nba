// Shared letter-grade color scale (A+ → F).
// Semantic: A green · B blue(brand) · C amber · D orange · F red.
const MAP = {
  a: { text: "text-emerald-400", ring: "ring-emerald-500/30", bg: "bg-emerald-500/10" },
  b: { text: "text-brand-glow", ring: "ring-brand/30", bg: "bg-brand/10" },
  c: { text: "text-amber-400", ring: "ring-amber-500/30", bg: "bg-amber-500/10" },
  d: { text: "text-orange-400", ring: "ring-orange-500/30", bg: "bg-orange-500/10" },
  f: { text: "text-red-400", ring: "ring-red-500/30", bg: "bg-red-500/10" },
  na: { text: "text-slate-300", ring: "ring-white/10", bg: "bg-white/5" },
};

export function gradeTier(grade) {
  const c = String(grade || "").trim().charAt(0).toUpperCase();
  return { A: "a", B: "b", C: "c", D: "d", F: "f" }[c] || "na";
}

export function gradeClasses(grade) {
  return MAP[gradeTier(grade)];
}
