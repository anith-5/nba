/*
 * Decision evaluation for the Basketball IQ simulator.
 *
 * WHY EXPECTED POINTS AND NOT RIGHT/WRONG
 * ---------------------------------------
 * Every option carries an EV in points per possession — what the offence
 * should average if it makes that choice from that floor. This is how the
 * sport actually evaluates decisions, and it gives graded feedback for free:
 * a pull-up two with a man closing out is not "wrong", it is 0.78 against a
 * 1.12 kick-out, and the gap is the lesson. It also means two good options can
 * sit 0.03 apart and the simulator will say so rather than inventing a winner.
 *
 * Anchors (league-wide, rounded): rim 1.25-1.40, open corner three 1.15,
 * open above-break three 1.08, contested three 0.75, long two 0.80, turnover
 * 0.00, shooting foul on a jump shooter ~1.5. Scenario EVs are authored
 * against these, and `shotEV` below exists so they stay anchored rather than
 * drifting to whatever felt right the day a scenario was written.
 */

import { distToRim, isThree, inPaint } from "./court.js";

// Points per attempt by look, before contest. Real-ish league figures.
const BASE = {
  rim: 1.32,
  paintShort: 0.96,
  midRange: 0.82,
  longTwo: 0.78,
  corner3: 1.17,
  aboveBreak3: 1.07,
};

// How much a defender within N feet takes off a shot. A hand up at 2ft is
// worth far more on a jumper than at the rim, where contact also draws fouls.
const CONTEST = { wide: 1.0, open: 0.94, guarded: 0.78, tight: 0.62, smothered: 0.48 };

export function contestLevel(gapFt) {
  if (gapFt >= 6) return "wide";
  if (gapFt >= 4) return "open";
  if (gapFt >= 2.5) return "guarded";
  if (gapFt >= 1.2) return "tight";
  return "smothered";
}

/** Anchor value for a shot from a spot against a given closest-defender gap.
 *  Used while authoring scenarios so the numbers stay internally consistent. */
export function shotEV(spot, gapFt) {
  const d = distToRim(spot);
  let base;
  if (isThree(spot)) base = spot.y <= 10 ? BASE.corner3 : BASE.aboveBreak3;
  else if (d <= 4) base = BASE.rim;
  else if (inPaint(spot)) base = BASE.paintShort;
  else if (d >= 17) base = BASE.longTwo;
  else base = BASE.midRange;
  return +(base * CONTEST[contestLevel(gapFt)]).toFixed(3);
}

// ── Verdict tiers ───────────────────────────────────────────────────────────
// Expressed as points of EV surrendered against the best available option.
export const TIERS = [
  { id: "optimal", max: 0.03, label: "Optimal read", tone: "great" },
  { id: "strong", max: 0.12, label: "Strong decision", tone: "good" },
  { id: "sound", max: 0.28, label: "Defensible", tone: "neutral" },
  { id: "questionable", max: 0.5, label: "Questionable", tone: "poor" },
  { id: "costly", max: Infinity, label: "Costly", tone: "bad" },
];

export function tierFor(evLost) {
  return TIERS.find((t) => evLost <= t.max);
}

/**
 * Score one decision.
 *
 * `stake` is the spread between the best and worst option. A possession where
 * every choice is within a few hundredths is not a real test of anything, so
 * it is weighted accordingly in the overall rating rather than counting the
 * same as a read worth half a point.
 */
/** Best and worst option values, respecting a scenario's scoring direction.
 *  For defence, fewer points allowed is better, so the extremes swap. */
function extremes(options, invert) {
  const evs = options.map((o) => o.ev);
  const hi = Math.max(...evs);
  const lo = Math.min(...evs);
  return invert ? { best: lo, worst: hi } : { best: hi, worst: lo };
}

export function evaluate(scenario, optionId) {
  const options = scenario.options;
  const chosen = options.find((o) => o.id === optionId);
  if (!chosen) return null;

  // Defensive scenarios author the same unit — offensive points per
  // possession — so a LOWER number is the better decision. Flipping here keeps
  // every EV in the library comparable instead of asking defensive scenarios
  // to invent a second scale.
  const { best, worst } = extremes(options, scenario.invert);
  const bestOption = options.find((o) => o.ev === best);
  const evLost = +Math.abs(best - chosen.ev).toFixed(3);
  const stake = +Math.abs(best - worst).toFixed(3);
  const capture = stake > 0 ? 1 - Math.abs(chosen.ev - best) / stake : 1;

  return {
    scenarioId: scenario.id,
    role: scenario.role,
    difficulty: scenario.difficulty,
    chosen,
    bestOption,
    wasBest: chosen.id === bestOption.id,
    ev: chosen.ev,
    bestEv: best,
    evLost,
    stake,
    capture: Math.max(0, Math.min(1, capture)),
    tier: tierFor(evLost),
    tags: chosen.tags || [],
  };
}

/** Timed out without choosing. Treated as the worst available option, because
 *  on a real floor indecision IS the turnover or the heave at the buzzer. */
export function evaluateTimeout(scenario) {
  const { best, worst } = extremes(scenario.options, scenario.invert);
  return {
    scenarioId: scenario.id,
    role: scenario.role,
    difficulty: scenario.difficulty,
    chosen: {
      id: "__timeout__",
      label: "No decision",
      ev: worst,
      feedback:
        "You ran out of time. Holding the ball while the defence settles is itself a choice, " +
        "and it is the one that gives the possession away. Read the floor before you catch, not after.",
      tags: ["decisiveness"],
    },
    bestOption: scenario.options.find((o) => o.ev === best),
    wasBest: false,
    ev: worst,
    bestEv: best,
    evLost: +Math.abs(best - worst).toFixed(3),
    stake: +Math.abs(best - worst).toFixed(3),
    capture: 0,
    tier: tierFor(Math.abs(best - worst)),
    tags: ["decisiveness"],
    timedOut: true,
  };
}

// ── Category tracking ───────────────────────────────────────────────────────
export const CATEGORIES = {
  shotSelection: "Shot selection",
  passing: "Passing decisions",
  offBall: "Off-ball movement",
  screens: "Screen decisions",
  spacing: "Spacing",
  defPositioning: "Defensive positioning",
  helpDefense: "Help defence",
  rotations: "Rotations",
  boxOut: "Rebounding",
  clock: "Clock management",
  turnover: "Ball security",
  decisiveness: "Decisiveness",
  advantage: "Advantage created",
};

/**
 * Overall rating from a run of decisions.
 *
 * Stake-weighted, so a run of easy reads cannot inflate the number and one
 * blown rotation in a possession where half a point was available counts for
 * what it actually cost. Scaled to put a competent but unexceptional run near
 * the middle rather than clustering everyone at the top.
 */
export function computeIQ(history) {
  if (!history.length) return null;

  let weighted = 0;
  let weight = 0;
  for (const h of history) {
    const w = Math.max(0.05, h.stake);
    weighted += h.capture * w;
    weight += w;
  }
  const ratio = weight > 0 ? weighted / weight : 0;

  const categories = {};
  for (const h of history) {
    for (const tag of h.tags.length ? h.tags : ["advantage"]) {
      if (!categories[tag]) categories[tag] = { n: 0, capture: 0, evLost: 0 };
      categories[tag].n += 1;
      categories[tag].capture += h.capture;
      categories[tag].evLost += h.evLost;
    }
  }
  const breakdown = Object.entries(categories)
    .filter(([key]) => CATEGORIES[key])
    .map(([key, v]) => ({
      key,
      label: CATEGORIES[key],
      n: v.n,
      rating: Math.round((v.capture / v.n) * 100),
      evLost: +v.evLost.toFixed(2),
    }))
    .sort((a, b) => a.rating - b.rating);

  const totalLost = +history.reduce((s, h) => s + h.evLost, 0).toFixed(2);
  const optimalCount = history.filter((h) => h.wasBest).length;

  return {
    iq: Math.round(ratio * 100),
    label: iqLabel(Math.round(ratio * 100)),
    possessions: history.length,
    optimalCount,
    optimalRate: Math.round((optimalCount / history.length) * 100),
    evLost: totalLost,
    evLostPer100: +((totalLost / history.length) * 100).toFixed(1),
    breakdown,
    strongest: breakdown.length ? breakdown[breakdown.length - 1] : null,
    weakest: breakdown.length ? breakdown[0] : null,
  };
}

function iqLabel(score) {
  if (score >= 92) return "Elite floor general";
  if (score >= 82) return "High-level processor";
  if (score >= 70) return "Solid decision-maker";
  if (score >= 55) return "Developing reads";
  if (score >= 40) return "Raw — sees one option at a time";
  return "Guessing";
}

// ── Difficulty ──────────────────────────────────────────────────────────────
// Difficulty changes what you are shown and how long you get, never which
// answer is correct. The basketball underneath is identical at every level.
export const DIFFICULTIES = {
  beginner: {
    id: "beginner",
    label: "Beginner",
    seconds: 0, // untimed
    blurb: "No clock. Open teammates, passing lanes and help defenders are all marked.",
    showOpenTeammates: true,
    showLanes: true,
    showHelp: true,
    showCoverage: true,
    hintReads: true,
  },
  intermediate: {
    id: "intermediate",
    label: "Intermediate",
    seconds: 12,
    blurb: "Open teammates highlighted. You work out the help and the lanes yourself.",
    showOpenTeammates: true,
    showLanes: false,
    showHelp: true,
    showCoverage: false,
    hintReads: false,
  },
  advanced: {
    id: "advanced",
    label: "Advanced",
    seconds: 7,
    blurb: "No highlighting. Read the floor from positioning alone.",
    showOpenTeammates: false,
    showLanes: false,
    showHelp: false,
    showCoverage: false,
    hintReads: false,
  },
  elite: {
    id: "elite",
    label: "Elite",
    seconds: 4,
    blurb: "Four seconds. No aids. Several options work; one is best.",
    showOpenTeammates: false,
    showLanes: false,
    showHelp: false,
    showCoverage: false,
    hintReads: false,
  },
};
