// Server-authoritative game logic for Build a Player -- every round reveals
// one random current-season NBA player with up to 12 real-stat-backed trait
// grades (see services/api/app/routers/rosters.py's _trait_grade_pass,
// which computes and embeds these grades once per roster sync; this module
// never recomputes a grade, only reads whatever's already on the player
// object). Unlike Themed Draft's turn-based snake order, every connected
// player acts on the SAME revealed player simultaneously each round --
// closer in shape to Over Under's simultaneous-round pattern than to a
// turn sequence. Traits aren't exclusive/competitive: this is about
// building your own best custom player, not stealing picks from opponents,
// so any number of players can lock the same trait off the same reveal.
//
// Fully public the whole time -- there's no hidden information at all here
// (unlike Closest To's Blind Mode PPG or Hint Auction's mystery identity),
// so sanitize.js's sanitizeBuildAPlayer only ever strips the non-serializable
// timer handle, never redacts game data.
import { getCachedRosterData } from "../data/rosterSync.js";

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
const TRAIT_KEYS = TRAIT_DEFS.map((t) => t.key);

// Numeric scale for averaging a completed build's letter grades into one
// composite grade at game end (D- lowest, A+ highest) -- mirrors
// rosters.py's GRADE_PERCENTILE_CUTS grade vocabulary exactly, just ordered
// low-to-high here since this direction is what averaging needs.
export const GRADE_ORDER = ["D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
const GRADE_VALUE = Object.fromEntries(GRADE_ORDER.map((g, i) => [g, i + 1]));

export const TRAIT_SLOT_COUNT_MIN = 6;
export const TRAIT_SLOT_COUNT_MAX = 12;
export const TRAIT_SLOT_COUNT_DEFAULT = 12;
export const PICK_TIMER_OPTIONS = [15, 30, 60, null];

export function initGameState(settings) {
  const traitSlotCountRaw = Number(settings.traitSlotCount);
  const traitSlotCount = Number.isFinite(traitSlotCountRaw)
    ? Math.max(TRAIT_SLOT_COUNT_MIN, Math.min(TRAIT_SLOT_COUNT_MAX, traitSlotCountRaw))
    : TRAIT_SLOT_COUNT_DEFAULT;
  const pickTimerSeconds = PICK_TIMER_OPTIONS.includes(settings.pickTimerSeconds) ? settings.pickTimerSeconds : 30;

  return {
    config: { traitSlotCount, pickTimerSeconds },
    phase: "picking", // picking | resolved
    currentPlayer: null,
    usedPlayerIds: [],
    roundNumber: 0,
    actedSocketIds: [],
    pickDeadlineAt: null,
    builds: {}, // socketId -> { [traitKey]: { grade, value, percentile, sourcePlayerId, sourcePlayerName } }
    doneSocketIds: [],
    roundHistory: [],
    compositeGrades: null,
    resolvedAt: null,
  };
}

// Only current-season players with at least one graded trait are eligible --
// revealing someone with zero graded traits (e.g. 0 GP, or every trait's
// underlying stat call failed this sync) would waste an entire round for
// everyone, nothing to pick or even pass meaningfully on.
function eligiblePlayerPool() {
  const players = getCachedRosterData()?.players || [];
  return players.filter((p) => p.traits && Object.keys(p.traits).length > 0);
}

// Soft repeat-avoidance, same shape as Hint Auction's pickWeightedMysteryPlayer:
// prefers a player who hasn't been revealed yet this game, but falls back to
// the full pool once everyone eligible has already come up rather than ever
// erroring out.
function pickRandomPlayer(pool, usedPlayerIds) {
  const usedSet = new Set(usedPlayerIds);
  const unused = pool.filter((p) => !usedSet.has(String(p.player_id)));
  const candidates = unused.length > 0 ? unused : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function openTraitKeysFor(gameState, socketId) {
  const build = gameState.builds[socketId] || {};
  return TRAIT_KEYS.filter((k) => !build[k]);
}

function eligibleTraitKeysForPlayerAndBuild(gameState, socketId) {
  const player = gameState.currentPlayer;
  if (!player) return [];
  const open = new Set(openTraitKeysFor(gameState, socketId));
  return Object.keys(player.traits || {}).filter((k) => open.has(k));
}

// Reveals a new random player and resets the round window -- called once at
// game start and again every time the current round fully resolves (see
// gameHandlers.js's allActed check), never per-pick.
export function revealPlayer(gameState) {
  const pool = eligiblePlayerPool();
  if (pool.length === 0) {
    return { error: "No current-season player data with graded traits is available yet." };
  }
  const player = pickRandomPlayer(pool, gameState.usedPlayerIds);
  gameState.usedPlayerIds.push(String(player.player_id));
  gameState.currentPlayer = player;
  gameState.roundNumber += 1;
  gameState.actedSocketIds = [];
  gameState.pickDeadlineAt = gameState.config.pickTimerSeconds
    ? Date.now() + gameState.config.pickTimerSeconds * 1000
    : null;
  return { ok: true, player };
}

export function beginGame(gameState, socketIds) {
  gameState.builds = {};
  gameState.doneSocketIds = [];
  for (const id of socketIds) gameState.builds[id] = {};
  gameState.phase = "picking";
  return revealPlayer(gameState);
}

export function pickTrait(gameState, socketId, traitKey) {
  if (gameState.phase !== "picking") return { error: "The build phase isn't active." };
  if (gameState.doneSocketIds.includes(socketId)) return { error: "Your build is already complete." };
  if (gameState.actedSocketIds.includes(socketId)) return { error: "You've already acted this round." };
  const player = gameState.currentPlayer;
  if (!player) return { error: "No player is currently revealed." };
  const traitData = player.traits?.[traitKey];
  if (!traitData) return { error: "That trait isn't available on this player." };
  const build = gameState.builds[socketId];
  if (build[traitKey]) return { error: "You've already locked that trait." };

  build[traitKey] = {
    grade: traitData.grade,
    value: traitData.value,
    percentile: traitData.percentile,
    sourcePlayerId: player.player_id,
    sourcePlayerName: player.name,
  };
  gameState.actedSocketIds.push(socketId);

  const filledCount = TRAIT_KEYS.filter((k) => build[k]).length;
  const done = filledCount >= gameState.config.traitSlotCount;
  if (done) gameState.doneSocketIds.push(socketId);

  return { ok: true, traitKey, done };
}

export function passReveal(gameState, socketId) {
  if (gameState.phase !== "picking") return { error: "The build phase isn't active." };
  if (gameState.doneSocketIds.includes(socketId)) return { error: "Your build is already complete." };
  if (gameState.actedSocketIds.includes(socketId)) return { error: "You've already acted this round." };
  gameState.actedSocketIds.push(socketId);
  return { ok: true };
}

// Timer-expiry fallback for one player who hasn't acted yet: locks a random
// ELIGIBLE trait if this reveal offers one they still need, otherwise just
// marks them acted with nothing picked -- never blocks the round waiting on
// someone the current reveal has nothing left to offer, same "never leave a
// stall point" philosophy as Themed Draft's auto-pick. Caller is expected to
// invoke this once per not-yet-acted connected player when the timer fires.
export function autoActOrSkip(gameState, socketId) {
  const eligible = eligibleTraitKeysForPlayerAndBuild(gameState, socketId);
  if (eligible.length === 0) {
    gameState.actedSocketIds.push(socketId);
    return { picked: false };
  }
  const traitKey = eligible[Math.floor(Math.random() * eligible.length)];
  const result = pickTrait(gameState, socketId, traitKey);
  return { picked: true, traitKey, done: result.done };
}

export function allPlayersDone(gameState, connectedSocketIds) {
  return connectedSocketIds.length > 0 && connectedSocketIds.every((id) => gameState.doneSocketIds.includes(id));
}

// Whether every connected player who ISN'T already done has acted this
// round. Callers must check allPlayersDone first -- once everyone connected
// is done, "acted" is a meaningless/trivially-true check on an empty set,
// and the game should resolve outright rather than reveal another round.
export function allActed(gameState, connectedSocketIds) {
  return connectedSocketIds
    .filter((id) => !gameState.doneSocketIds.includes(id))
    .every((id) => gameState.actedSocketIds.includes(id));
}

export function computeCompositeGrade(build) {
  const grades = TRAIT_KEYS.map((k) => build[k]?.grade).filter(Boolean);
  if (grades.length === 0) return null;
  const avg = grades.reduce((sum, g) => sum + GRADE_VALUE[g], 0) / grades.length;
  const idx = Math.max(0, Math.min(GRADE_ORDER.length - 1, Math.round(avg) - 1));
  return GRADE_ORDER[idx];
}

export function finalizeGame(gameState) {
  gameState.phase = "resolved";
  gameState.pickDeadlineAt = null;
  gameState.compositeGrades = {};
  for (const socketId of Object.keys(gameState.builds)) {
    gameState.compositeGrades[socketId] = computeCompositeGrade(gameState.builds[socketId]);
  }
  gameState.resolvedAt = Date.now();
  return gameState;
}
