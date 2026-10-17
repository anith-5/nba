import { ONBALL } from "./onball.js";
import { OFFBALL } from "./offball.js";
import { DEFENSE } from "./defense.js";
import { SITUATIONAL } from "./situational.js";

export const SCENARIOS = [...ONBALL, ...OFFBALL, ...DEFENSE, ...SITUATIONAL];

export const ROLES = {
  onball: { id: "onball", label: "On the ball", blurb: "You have it. Shoot, drive, pass or reset." },
  offball: { id: "offball", label: "Off the ball", blurb: "Cut, screen, relocate or hold your spacing." },
  defense: { id: "defense", label: "Defending", blurb: "Contain, help, rotate, switch or box out." },
};

export const FAMILIES = [...new Set(SCENARIOS.map((s) => s.family))].sort();

/** Scenarios matching the chosen difficulty and roles, shuffled.
 *
 *  Difficulty filters loosely rather than exactly: there are not enough
 *  scenarios at any single level to fill a long session without repeats, and
 *  the difficulty setting already changes the timer and the visual aids. A
 *  beginner-tagged read presented with no aids and four seconds is a genuinely
 *  harder question than the same read at the beginner setting.
 */
const ORDER = ["beginner", "intermediate", "advanced", "elite"];

export function pickScenarios({ difficulty, roles, count = 10, seed = Math.random() }) {
  const level = ORDER.indexOf(difficulty);
  const pool = SCENARIOS.filter((s) => {
    if (roles?.length && !roles.includes(s.role)) return false;
    return true;
  });

  // Prefer scenarios at or below the selected level, then widen if short.
  const preferred = pool.filter((s) => ORDER.indexOf(s.difficulty) <= Math.max(1, level));
  const chosen = (preferred.length >= count ? preferred : pool).slice();

  // Deterministic shuffle so a seed reproduces a session.
  let r = Math.floor(seed * 1e9) || 1;
  const rand = () => {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    return r / 0x7fffffff;
  };
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen.slice(0, count);
}

export function scenarioById(id) {
  return SCENARIOS.find((s) => s.id === id) || null;
}
