// Mirrors services/arena-realtime/src/game-logic/buildAPlayer.js's
// TRAIT_DEFS/GRADE_ORDER -- duplicated rather than imported, same reason
// apps/web and services/arena-realtime duplicate everything else
// server-only (separate deployments, no shared workspace). Same pattern as
// statCategories.js mirroring overUnder.js's STAT_CATEGORIES.
export const TRAIT_DEFS = [
  { key: "three_pt", label: "3PT Shooting" },
  { key: "mid_range", label: "Mid-Range Shooting" },
  { key: "free_throw", label: "Free Throw Shooting" },
  { key: "finishing", label: "Finishing/Interior Scoring" },
  { key: "playmaking", label: "Playmaking" },
  { key: "ball_security", label: "Ball Security" },
  { key: "perimeter_defense", label: "Perimeter Defense" },
  { key: "interior_defense", label: "Interior Defense" },
  { key: "rebounding", label: "Rebounding" },
  { key: "durability", label: "Durability" },
  { key: "efficiency", label: "Overall Efficiency" },
  { key: "clutch", label: "Clutch Performance" },
];

export const GRADE_ORDER = ["D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];

export function gradeColorClass(grade) {
  if (!grade) return "border-slate-800 bg-slate-950 text-slate-500";
  if (grade.startsWith("A")) return "border-amber-400/50 bg-amber-400/10 text-amber-300";
  if (grade.startsWith("B")) return "border-court/50 bg-court/10 text-court-glow";
  if (grade.startsWith("C")) return "border-slate-500/50 bg-slate-500/10 text-slate-300";
  return "border-slate-700 bg-slate-800/60 text-slate-400"; // D+ / D / D-
}
