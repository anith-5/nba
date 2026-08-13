// Server-authoritative game logic for Themed Player Draft -- a live
// snake-draft where every player picks real NBA players, one at a time,
// from a pool filtered down to whatever theme the host chose. Unlike
// Closest To's Blind Mode or Hint Auction's mystery-player secrecy, drafted
// picks are fully public the moment they're made (see sanitize.js's
// sanitizeThemedDraft, which only ever redacts in-progress vote choices,
// never picks). Once every roster is full, everyone votes for the team that
// best fits the theme (never their own) and a simple-majority winner is
// revealed, ties broken at random rather than with a runoff round -- a
// second full voting phase would just be another stall point, the same
// reasoning Hint Auction's forced roster-slot fill cascade already applies
// to a won-but-unassignable player.
import players from "../data/nba_players.json" with { type: "json" };
import { getCachedRosterData } from "../data/rosterSync.js";
// Reused directly rather than redefined -- same package, server-to-server,
// same rationale as Hint Auction importing Five Hints' hint-writing tables
// instead of duplicating them.
import { STAT_CATEGORIES } from "./overUnder.js";

export const ROSTER_SIZE_MIN = 3;
export const ROSTER_SIZE_MAX = 7;
export const ROSTER_SIZE_DEFAULT = 5;
export const TURN_TIMER_OPTIONS = [15, 30, 60, null];
export const CATEGORIES = ["team", "era", "award", "archetype", "stat-threshold", "current-season"];

const CURRENT_YEAR = new Date().getFullYear();

// --- Category pool builders ---
// All-time categories filter nba_players.json (one row per career, not per
// season -- unlike Closest To/Hint Auction's per-season data). Current
// Season pulls from the same live-synced cache Hint Auction's Current era
// already reads (rosterSync.js's getCachedRosterData), rather than a second
// implementation -- current-player records have no career/award/archetype
// fields at all, so this category can't be combined with the other five.

function teamPool(teamAbbr) {
  return players.filter((p) => Array.isArray(p.teams) && p.teams.includes(teamAbbr));
}

// Matched against career span (years_active_start/years_active_end) rather
// than per-season entries, adapting Closest To's era vocabulary
// (all-time/modern/classic/custom) to this dataset's one-row-per-career
// shape: a player qualifies if any part of their career overlaps the era.
function careerOverlapsEra(player, era, eraStart, eraEnd) {
  const start = player.years_active_start;
  const end = player.years_active_end ?? start;
  if (typeof start !== "number") return false;
  if (era === "modern") return end >= 2015;
  if (era === "classic") return start < 2000;
  if (era === "custom") return end >= (eraStart ?? 0) && start <= (eraEnd ?? CURRENT_YEAR);
  return true; // all-time
}

function eraPool(era, eraStart, eraEnd) {
  return players.filter((p) => careerOverlapsEra(p, era, eraStart, eraEnd));
}

const AWARD_KEYS = new Set(["mvp", "finals_mvp", "dpoy", "roy", "sixth_man"]);

function awardPool(awardKey) {
  if (awardKey === "all-star") return players.filter((p) => p.all_star_appearances > 0);
  if (awardKey === "hall-of-fame") return players.filter((p) => p.is_hall_of_fame);
  if (AWARD_KEYS.has(awardKey)) return players.filter((p) => (p.awards?.[awardKey] || 0) > 0);
  return players.filter((p) => p.is_hall_of_fame); // sensible non-empty fallback
}

// The only six archetype_tag values actually present in nba_players.json --
// see the schema-discovery pass before this module was written.
export const ARCHETYPE_TAGS = ["big-defender", "big-scorer", "guard-defender", "guard-scorer", "wing-defender", "wing-scorer"];
const ARCHETYPE_TAG_SET = new Set(ARCHETYPE_TAGS);

function archetypePool(tag) {
  if (!ARCHETYPE_TAG_SET.has(tag)) return players;
  return players.filter((p) => p.archetype_tag === tag);
}

function statThresholdPool(statKey, threshold) {
  if (!STAT_CATEGORIES[statKey]) return players;
  const min = Number(threshold);
  if (!Number.isFinite(min)) return players;
  return players.filter((p) => typeof p[statKey] === "number" && p[statKey] >= min);
}

function currentSeasonPool() {
  return getCachedRosterData()?.players || [];
}

export function buildAvailablePool(config) {
  switch (config.category) {
    case "team":
      return teamPool(config.secondaryParam?.team);
    case "era":
      return eraPool(config.secondaryParam?.era, config.secondaryParam?.eraStart, config.secondaryParam?.eraEnd);
    case "award":
      return awardPool(config.secondaryParam?.award);
    case "archetype":
      return archetypePool(config.secondaryParam?.archetype);
    case "stat-threshold":
      return statThresholdPool(config.secondaryParam?.statKey, config.secondaryParam?.threshold);
    case "current-season":
      return currentSeasonPool();
    default:
      return players;
  }
}

// --- Setup ---

export function initGameState(settings) {
  const category = CATEGORIES.includes(settings.category) ? settings.category : "team";
  const rosterSizeRaw = Number(settings.rosterSize);
  const rosterSize = Number.isFinite(rosterSizeRaw)
    ? Math.max(ROSTER_SIZE_MIN, Math.min(ROSTER_SIZE_MAX, rosterSizeRaw))
    : ROSTER_SIZE_DEFAULT;
  const turnTimerSeconds = TURN_TIMER_OPTIONS.includes(settings.turnTimerSeconds) ? settings.turnTimerSeconds : 30;

  return {
    config: {
      category,
      secondaryParam: settings.secondaryParam || {},
      rosterSize,
      turnTimerSeconds,
    },
    phase: "drafting",
    pickOrder: [],
    pickSequence: [],
    currentPickIndex: 0,
    round: 1,
    availablePool: [],
    rosters: {},
    pickDeadlineAt: null,
    draftHistory: [],
    votes: {},
    voteCounts: null,
    winnerSocketId: null,
    tied: false,
    tiedSocketIds: [],
    resolvedAt: null,
  };
}

// Standard snake order: round 1 picks in join order, round 2 reverses it,
// round 3 goes forward again, etc., flattened into one full pick sequence
// so "whose turn is it" is a single index rather than separately tracked
// round/seat state.
function buildSnakeSequence(socketIds, rosterSize) {
  const sequence = [];
  for (let round = 0; round < rosterSize; round++) {
    const order = round % 2 === 0 ? socketIds : [...socketIds].reverse();
    sequence.push(...order);
  }
  return sequence;
}

// Starts the draft: resolves the theme's pool once (never recomputed
// per-pick, only shrunk as picks happen), sets up every connected player's
// empty roster and the full snake pick sequence. If the chosen category
// resolves to nothing (bad/missing secondaryParam, or a Current Season
// category with no live cache yet), falls back to the full all-time pool
// rather than starting a draft nobody can make a single pick in.
export function beginDraft(gameState, socketIds) {
  let pool = buildAvailablePool(gameState.config);
  if (pool.length === 0) {
    console.warn(
      `[themedDraft] category "${gameState.config.category}" produced an empty pool -- falling back to the full all-time pool so the draft can still start`
    );
    pool = players;
  }
  pool = [...pool].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  gameState.availablePool = pool;
  gameState.pickOrder = [...socketIds];
  gameState.pickSequence = buildSnakeSequence(socketIds, gameState.config.rosterSize);
  gameState.currentPickIndex = 0;
  gameState.round = 1;
  gameState.rosters = {};
  for (const id of socketIds) gameState.rosters[id] = [];
  gameState.draftHistory = [];
  gameState.phase = "drafting";
  gameState.pickDeadlineAt = gameState.config.turnTimerSeconds
    ? Date.now() + gameState.config.turnTimerSeconds * 1000
    : null;
  gameState.votes = {};
  gameState.voteCounts = null;
  gameState.winnerSocketId = null;
  gameState.tied = false;
  gameState.tiedSocketIds = [];
  gameState.resolvedAt = null;
  return gameState;
}

// --- Drafting ---

export function currentTurnSocketId(gameState) {
  return gameState.pickSequence[gameState.currentPickIndex] ?? null;
}

function removeFromPool(gameState, playerId) {
  const idx = gameState.availablePool.findIndex((p) => String(p.player_id) === String(playerId));
  if (idx === -1) return null;
  const [player] = gameState.availablePool.splice(idx, 1);
  return player;
}

function recordPick(gameState, socketId, player, auto) {
  gameState.rosters[socketId].push(player);
  gameState.draftHistory.push({
    pickNumber: gameState.currentPickIndex + 1,
    round: gameState.round,
    socketId,
    player,
    auto,
  });
}

export function makePick(gameState, socketId, playerId) {
  if (gameState.phase !== "drafting") return { error: "The draft isn't active." };
  if (currentTurnSocketId(gameState) !== socketId) return { error: "It's not your turn to pick." };
  const player = removeFromPool(gameState, playerId);
  if (!player) return { error: "That player isn't available." };
  recordPick(gameState, socketId, player, false);
  return { ok: true, player };
}

// Timer-expiry fallback: never leaves the draft stalled on one slow or
// disconnected drafter, same philosophy as Hint Auction's forced roster-slot
// fill cascade.
export function autoPickRandom(gameState) {
  const socketId = currentTurnSocketId(gameState);
  if (!socketId) return { error: "No active turn." };
  if (gameState.availablePool.length === 0) return { error: "Pool exhausted.", socketId };
  const i = Math.floor(Math.random() * gameState.availablePool.length);
  const [player] = gameState.availablePool.splice(i, 1);
  recordPick(gameState, socketId, player, true);
  return { ok: true, player, socketId };
}

export function advanceTurn(gameState) {
  gameState.currentPickIndex += 1;
  gameState.round = Math.floor(gameState.currentPickIndex / gameState.pickOrder.length) + 1;
  if (gameState.currentPickIndex >= gameState.pickSequence.length) {
    gameState.pickDeadlineAt = null;
    return { draftComplete: true };
  }
  gameState.pickDeadlineAt = gameState.config.turnTimerSeconds
    ? Date.now() + gameState.config.turnTimerSeconds * 1000
    : null;
  return { draftComplete: false };
}

// A very small category pool combined with a large lobby/roster size can run
// out of players before every slot is filled -- rather than stalling on a
// pick that can never happen, that slot is left empty and the turn advances.
export function skipCurrentTurn(gameState) {
  const socketId = currentTurnSocketId(gameState);
  gameState.draftHistory.push({
    pickNumber: gameState.currentPickIndex + 1,
    round: gameState.round,
    socketId,
    player: null,
    auto: true,
    skipped: true,
  });
  return advanceTurn(gameState);
}

// --- Voting ---

export function openVoting(gameState, connectedSocketIds) {
  gameState.phase = "voting";
  gameState.eligibleVoterSocketIds = [...connectedSocketIds];
  gameState.votes = {};
  return gameState;
}

// Votes can be changed until resolution, same as Over Under's submit_vote
// (no lock-on-first-submit) -- resolution fires the instant every currently
// connected player has a vote recorded, not on a timer.
export function castVote(gameState, voterSocketId, votedForSocketId) {
  if (gameState.phase !== "voting") return { error: "Voting isn't open." };
  if (!gameState.rosters[votedForSocketId]) return { error: "That's not a valid team." };
  if (votedForSocketId === voterSocketId) return { error: "You can't vote for your own team." };
  gameState.votes[voterSocketId] = votedForSocketId;
  return { ok: true };
}

export function allVoted(gameState, connectedSocketIds) {
  return connectedSocketIds.length > 0 && connectedSocketIds.every((id) => gameState.votes[id]);
}

export function resolveVoting(gameState) {
  const counts = {};
  for (const votedFor of Object.values(gameState.votes)) {
    counts[votedFor] = (counts[votedFor] || 0) + 1;
  }

  const entries = Object.entries(counts);
  let winnerSocketId;
  let tied = false;
  let tiedSocketIds = [];

  if (entries.length === 0) {
    // Nobody managed to vote (every remaining player disconnected mid-vote)
    // -- fall back to a random winner among all drafted teams rather than
    // leaving the game unresolved forever.
    const candidateIds = Object.keys(gameState.rosters);
    tied = true;
    tiedSocketIds = candidateIds;
    winnerSocketId = candidateIds[Math.floor(Math.random() * candidateIds.length)];
  } else {
    const maxCount = Math.max(...entries.map(([, c]) => c));
    tiedSocketIds = entries.filter(([, c]) => c === maxCount).map(([id]) => id);
    tied = tiedSocketIds.length > 1;
    winnerSocketId = tiedSocketIds[Math.floor(Math.random() * tiedSocketIds.length)];
  }

  gameState.phase = "resolved";
  gameState.voteCounts = counts;
  gameState.winnerSocketId = winnerSocketId;
  gameState.tied = tied;
  gameState.tiedSocketIds = tiedSocketIds;
  return { winnerSocketId, voteCounts: counts, tied, tiedSocketIds };
}

export function finalizeGame(gameState) {
  gameState.resolvedAt = Date.now();
  return gameState;
}
