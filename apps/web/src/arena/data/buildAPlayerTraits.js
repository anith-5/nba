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
  if (!grade) return "border-ink/15 bg-ink/[0.04] text-ink/50";
  if (grade.startsWith("A")) return "border-stat-up/50 bg-stat-up/10 text-stat-up";
  if (grade.startsWith("B")) return "border-terracotta/50 bg-terracotta/10 text-terracotta";
  if (grade.startsWith("C")) return "border-ink/25 bg-ink/5 text-ink/70";
  return "border-basketball/40 bg-basketball/10 text-basketball-dim"; // D+ / D / D-
}
