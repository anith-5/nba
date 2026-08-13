// Server-authoritative game logic for NBA 82-0 -- a starting-lineup builder
// with a very similar spin-and-build structure to Closest To, but with two
// dimensions spun together (team + decade, not team alone), a lineup board
// that stays fully editable via reassignment/swap rather than Closest To's
// strictly-additive one-shot fill, and a standalone formula that converts
// the finished lineup into a projected win-loss record instead of a
// closest-to-target comparison.
//
// Unlike Closest To's Blind Mode, there is no hidden information here at
// all -- stats are visible the moment a team/decade is spun, so there is
// nothing for sanitize.js to redact (see the module comment there for why
// no sanitizer branch was added for this game).
import playerSeasonsByTeam from "../data/nba_player_seasons.json" with { type: "json" };
import { getTeamPlayers, getResolvedTeamPlayers } from "../data/teamPlayersCache.js";

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
export const BENCH_SLOT = "BENCH";
export const DECADES = [1980, 1990, 2000, 2010, 2020];
const TEAM_ABBREVIATIONS = Object.keys(playerSeasonsByTeam);

// Real positional fluidity, applied as a heuristic layer on top of each
// player's single recorded position -- there is no "capable positions"
// field anywhere in this codebase's data (nba_players.json, team_players.py
// both resolve to exactly one position per player-season), so this fixed
// adjacency map is an approximation, not real per-player data. One hop only
// (PG is adjacent to SG but not SF) -- see fitTier below.
const POSITION_ADJACENCY = {
  PG: ["SG"],
  SG: ["PG", "SF"],
  SF: ["SG", "PF"],
  PF: ["SF", "C"],
  C: ["PF"],
};

// Position-weighted blend of a player's decade-averaged ppg/apg/rpg into one
// skill number for whichever SLOT they're assigned to -- applied using the
// SLOT's weights regardless of the occupant's own real position. A player
// forced into a mismatched slot is scored by that slot's own formula; the
// fit penalty (FIT_BONUS.mismatch below) is what actually punishes the bad
// fit, not a different/weaker skill formula.
const SLOT_WEIGHTS = {
  PG: { ppg: 0.30, apg: 0.40, rpg: 0.30 },
  SG: { ppg: 0.50, apg: 0.25, rpg: 0.25 },
  SF: { ppg: 0.40, apg: 0.30, rpg: 0.30 },
  PF: { ppg: 0.35, apg: 0.20, rpg: 0.45 },
  C: { ppg: 0.30, apg: 0.15, rpg: 0.55 },
};

const FIT_BONUS = { full: 0.08, adjacent: 0.03, mismatch: -0.1 };
const ERA_BONUS_BY_DISTINCT_DECADES = { 1: 0.05, 2: 0.02, 3: 0, 4: -0.02, 5: -0.04 };
const VARIANCE_RANGE = 0.06; // +-6%, applied once to the final composite

// Logistic curve: sigmoid(0) = 0.5 -> exactly 41/82 at the midpoint, by
// construction, matching "an average lineup centers around 41-41" with no
// extra offset math needed. midpoint/steepness derived from plugging
// worst/average/best-realistic stat lines through the formula above --
// see the conversation this was designed in for the full derivation; the
// short version is average-composite ~9.2 -> 41 wins, and steepness ~0.14
// puts realistic best-case composites (~30+) in the low-to-mid 70s and
// worst-case composites (~1) around 20, matching the target ranges. The
// curve asymptotically approaches but can never reach 82 -- a lineup can
// never actually go 82-0, which is the whole joke of the mode's name.
const WIN_CURVE_MIDPOINT = 9.2;
const WIN_CURVE_STEEPNESS = 0.14;

function round1(n) {
  return Math.round(n * 10) / 10;
}

function seasonStartYear(season) {
  return parseInt(season.slice(0, 4), 10);
}

function decadeOf(season) {
  return Math.floor(seasonStartYear(season) / 10) * 10;
}

function lineupSlots(benchEnabled) {
  return benchEnabled ? [...POSITIONS, BENCH_SLOT] : POSITIONS;
}

function emptyLineup(benchEnabled) {
  const lineup = {};
  for (const slot of lineupSlots(benchEnabled)) lineup[slot] = null;
  return lineup;
}

export function requiredSlotCount(benchEnabled) {
  return benchEnabled ? 6 : 5;
}

// --- Eligibility + spin (fast static prefilter, same file/pattern Closest
// To uses -- see that module's comment on why this stays on the lightweight
// static data rather than the potentially slow/still-loading live roster) ---

function eligibleEntriesForTeamDecade(teamAbbr, decade) {
  const team = playerSeasonsByTeam[teamAbbr];
  if (!team) return [];
  const entries = [];
  for (const player of team.players) {
    for (const s of player.seasons) {
      if (decadeOf(s.season) !== decade) continue;
      entries.push({ player, season: s });
    }
  }
  return entries;
}

function hasOpenSlot(lineup, benchEnabled) {
  return lineupSlots(benchEnabled).some((slot) => !lineup[slot]);
}

function pickRandomTeamAndDecade(lineup, benchEnabled) {
  if (!hasOpenSlot(lineup, benchEnabled)) return null;
  const maxAttempts = TEAM_ABBREVIATIONS.length * DECADES.length * 3;
  for (let i = 0; i < maxAttempts; i++) {
    const abbr = TEAM_ABBREVIATIONS[Math.floor(Math.random() * TEAM_ABBREVIATIONS.length)];
    const decade = DECADES[Math.floor(Math.random() * DECADES.length)];
    if (eligibleEntriesForTeamDecade(abbr, decade).length > 0) {
      return { abbr, teamName: playerSeasonsByTeam[abbr].team_name, decade };
    }
  }
  for (const abbr of TEAM_ABBREVIATIONS) {
    for (const decade of DECADES) {
      if (eligibleEntriesForTeamDecade(abbr, decade).length > 0) {
        return { abbr, teamName: playerSeasonsByTeam[abbr].team_name, decade };
      }
    }
  }
  return null;
}

// Guarantees landing on a DIFFERENT decade than the one being rerolled away
// from -- a respin that could return the same value would waste a
// single-use token for nothing.
function pickRandomDecadeForTeam(abbr, currentDecade) {
  const alternatives = DECADES.filter((d) => d !== currentDecade).sort(() => Math.random() - 0.5);
  for (const decade of alternatives) {
    if (eligibleEntriesForTeamDecade(abbr, decade).length > 0) return decade;
  }
  return null; // this team has nothing eligible in any OTHER decade
}

function pickRandomTeamForDecade(decade, currentAbbr) {
  const others = TEAM_ABBREVIATIONS.filter((a) => a !== currentAbbr);
  const maxAttempts = others.length * 3;
  for (let i = 0; i < maxAttempts; i++) {
    const abbr = others[Math.floor(Math.random() * others.length)];
    if (eligibleEntriesForTeamDecade(abbr, decade).length > 0) {
      return { abbr, teamName: playerSeasonsByTeam[abbr].team_name };
    }
  }
  for (const abbr of others) {
    if (eligibleEntriesForTeamDecade(abbr, decade).length > 0) {
      return { abbr, teamName: playerSeasonsByTeam[abbr].team_name };
    }
  }
  return null;
}

// --- Player list resolution (live/cached full-franchise data) ---

const NAME_SUFFIXES = new Set(["JR", "JR.", "SR", "SR.", "II", "III", "IV", "V"]);
function lastNameKey(fullName) {
  const parts = fullName.trim().split(/\s+/);
  let last = parts[parts.length - 1];
  if (parts.length > 1 && NAME_SUFFIXES.has(last.toUpperCase().replace(/\.$/, ""))) {
    last = parts[parts.length - 2];
  }
  return last.toLowerCase();
}

function primaryPosition(seasons) {
  const counts = {};
  for (const s of seasons) counts[s.position] = (counts[s.position] || 0) + 1;
  let best = seasons[0]?.position || "SF";
  let bestCount = 0;
  for (const pos of POSITIONS) {
    if ((counts[pos] || 0) > bestCount) {
      best = pos;
      bestCount = counts[pos];
    }
  }
  return best;
}

export async function resolveTeamRoster(teamAbbr) {
  return getTeamPlayers(teamAbbr);
}

// Blends a player's confirmed seasons within the spun decade into one
// representative stat line -- a player picked for "the 1990s Bulls"
// represents their whole decade-long stint on that team, not one arbitrary
// season (unlike Closest To, which picks an exact season).
export function buildSelectionListForDecade(rosterData, decade) {
  const players = (rosterData?.players || [])
    .map((p) => {
      const decadeSeasons = p.seasons.filter((s) => decadeOf(s.season) === decade && s.ppg_confirmed);
      return { name: p.name, player_id: p.player_id, decadeSeasons };
    })
    .filter((p) => p.decadeSeasons.length > 0);

  players.sort((a, b) => lastNameKey(a.name).localeCompare(lastNameKey(b.name)));

  return players.map((p) => {
    const avg = (key) => round1(p.decadeSeasons.reduce((sum, s) => sum + (s[key] || 0), 0) / p.decadeSeasons.length);
    return {
      name: p.name,
      player_id: p.player_id,
      position: primaryPosition(p.decadeSeasons),
      ppg: avg("ppg"),
      apg: avg("ast_pg"),
      rpg: avg("reb_pg"),
      seasonsPlayed: p.decadeSeasons.length,
    };
  });
}

export function findDecadeStatLine(teamAbbr, playerId, decade) {
  const resolved = getResolvedTeamPlayers(teamAbbr);
  const player = resolved?.players?.find((p) => p.player_id === playerId);
  if (!player) return null;
  const decadeSeasons = player.seasons.filter((s) => decadeOf(s.season) === decade && s.ppg_confirmed);
  if (decadeSeasons.length === 0) return null;
  const avg = (key) => round1(decadeSeasons.reduce((sum, s) => sum + (s[key] || 0), 0) / decadeSeasons.length);
  return {
    name: player.name,
    playerId: player.player_id,
    position: primaryPosition(decadeSeasons),
    ppg: avg("ppg"),
    apg: avg("ast_pg"),
    rpg: avg("reb_pg"),
  };
}

// --- Game state ---

export function initGameState(settings) {
  return {
    benchEnabled: settings.benchEnabled === true,
    phase: "building", // building | resolved
    playerBuilds: {},
    results: null,
  };
}

function emptyBuildState(benchEnabled) {
  return {
    lineup: emptyLineup(benchEnabled),
    pickCount: 0,
    pendingSpin: null, // { abbr, teamName, decade }
    decadeRerollUsed: false,
    teamRerollUsed: false,
    done: false,
  };
}

export function ensurePlayerBuild(gameState, socketId) {
  if (!gameState.playerBuilds[socketId]) {
    gameState.playerBuilds[socketId] = emptyBuildState(gameState.benchEnabled);
  }
  return gameState.playerBuilds[socketId];
}

// --- Spin / respin ---
// No server-side guard against spinning again while a pendingSpin already
// exists (it's simply overwritten) -- same permissive posture Closest To's
// handleSpin already has (it only checks `done`, nothing about an existing
// pendingTeam either); the client is expected to only expose the spin
// action when it makes sense, exactly as Closest To's UI already does.

export function handleSpin(gameState, socketId) {
  const state = ensurePlayerBuild(gameState, socketId);
  if (state.done) return { error: "Your lineup is already finalized." };
  const spin = pickRandomTeamAndDecade(state.lineup, gameState.benchEnabled);
  if (!spin) return { error: "No eligible team/decade combinations remain." };
  state.pendingSpin = spin;
  return { ok: true, spin };
}

export function handleRespinDecade(gameState, socketId) {
  const state = ensurePlayerBuild(gameState, socketId);
  if (state.done) return { error: "Your lineup is already finalized." };
  if (!state.pendingSpin) return { error: "No active spin to respin." };
  if (state.decadeRerollUsed) return { error: "Decade respin already used." };
  const decade = pickRandomDecadeForTeam(state.pendingSpin.abbr, state.pendingSpin.decade);
  if (decade === null) return { error: "No other eligible decade for this team." };
  state.decadeRerollUsed = true;
  state.pendingSpin = { ...state.pendingSpin, decade };
  return { ok: true, spin: state.pendingSpin };
}

export function handleRespinTeam(gameState, socketId) {
  const state = ensurePlayerBuild(gameState, socketId);
  if (state.done) return { error: "Your lineup is already finalized." };
  if (!state.pendingSpin) return { error: "No active spin to respin." };
  if (state.teamRerollUsed) return { error: "Team respin already used." };
  const team = pickRandomTeamForDecade(state.pendingSpin.decade, state.pendingSpin.abbr);
  if (!team) return { error: "No other eligible team for this decade." };
  state.teamRerollUsed = true;
  state.pendingSpin = { ...state.pendingSpin, abbr: team.abbr, teamName: team.teamName };
  return { ok: true, spin: state.pendingSpin };
}

// --- Pick / reassign / finalize ---
// Picks always target an OPEN slot; reassignment (move-or-swap) is the only
// way a filled slot changes hands or empties -- and fit is never enforced
// on either write path (any player can go anywhere), only scored at the
// end, since a hard block would make the "forced mismatch" fit tier
// unreachable.

export function handleConfirmPick(gameState, socketId, { playerId, position }) {
  const state = ensurePlayerBuild(gameState, socketId);
  if (state.done) return { error: "Your lineup is already finalized." };
  if (!state.pendingSpin) return { error: "No active spin to confirm a pick for." };
  if (!lineupSlots(gameState.benchEnabled).includes(position)) return { error: "Invalid slot." };
  if (state.lineup[position]) return { error: "That slot is already filled -- reassign the current occupant first." };

  const entry = findDecadeStatLine(state.pendingSpin.abbr, playerId, state.pendingSpin.decade);
  if (!entry) return { error: "Invalid player for this team/decade." };

  state.lineup[position] = {
    name: entry.name,
    playerId: entry.playerId,
    team: state.pendingSpin.abbr,
    teamName: state.pendingSpin.teamName,
    decade: state.pendingSpin.decade,
    realPosition: entry.position,
    ppg: entry.ppg,
    apg: entry.apg,
    rpg: entry.rpg,
  };
  state.pickCount += 1;
  state.pendingSpin = null;

  return { ok: true, state };
}

// Move-or-swap: moves into an empty target slot, or exchanges occupants if
// the target is filled. Pure move-to-empty-only would become impossible the
// moment every slot is filled -- exactly when reassignment matters most (see
// this module's header comment) -- so swap is the default, not a special case.
export function handleReassign(gameState, socketId, { fromPosition, toPosition }) {
  const state = ensurePlayerBuild(gameState, socketId);
  if (state.done) return { error: "Your lineup is already finalized." };
  const slots = lineupSlots(gameState.benchEnabled);
  if (!slots.includes(fromPosition) || !slots.includes(toPosition)) return { error: "Invalid slot." };
  if (fromPosition === toPosition) return { error: "Can't reassign a slot to itself." };
  if (!state.lineup[fromPosition]) return { error: "That slot is empty." };

  const moving = state.lineup[fromPosition];
  const displaced = state.lineup[toPosition];
  state.lineup[toPosition] = moving;
  state.lineup[fromPosition] = displaced || null;

  return { ok: true, lineup: state.lineup };
}

export function handleFinalizeBuild(gameState, socketId) {
  const state = ensurePlayerBuild(gameState, socketId);
  if (state.done) return { error: "Already finalized." };
  const slots = lineupSlots(gameState.benchEnabled);
  const filled = slots.filter((s) => state.lineup[s]);
  if (filled.length < requiredSlotCount(gameState.benchEnabled)) {
    return { error: "Fill every slot before finalizing." };
  }
  state.done = true;
  state.pendingSpin = null;
  return { ok: true };
}

export function allPlayersDone(gameState, connectedSocketIds) {
  return connectedSocketIds.length > 0 && connectedSocketIds.every((id) => gameState.playerBuilds[id]?.done);
}

// --- Scoring ---

function fitTier(realPosition, slot) {
  if (slot === BENCH_SLOT) return "full"; // no natural position to mismatch against
  if (realPosition === slot) return "full";
  if ((POSITION_ADJACENCY[slot] || []).includes(realPosition)) return "adjacent";
  return "mismatch";
}

function slotWeightsFor(slot, occupant) {
  // BENCH borrows whichever weight table matches the occupant's own real
  // recorded position -- it isn't a real on-court position, so it has no
  // weight table of its own.
  const key = slot === BENCH_SLOT ? occupant.realPosition : slot;
  return SLOT_WEIGHTS[key] || SLOT_WEIGHTS.SF;
}

function computeBaseSkillScore(lineup, slots) {
  const filled = slots.filter((s) => lineup[s]);
  if (filled.length === 0) return 0;
  const perSlotScores = filled.map((slot) => {
    const occupant = lineup[slot];
    const w = slotWeightsFor(slot, occupant);
    return occupant.ppg * w.ppg + occupant.apg * w.apg + occupant.rpg * w.rpg;
  });
  return perSlotScores.reduce((sum, s) => sum + s, 0) / perSlotScores.length;
}

function computeFitBonus(lineup, slots) {
  const filled = slots.filter((s) => lineup[s]);
  let totalPct = 0;
  const breakdown = {};
  for (const slot of filled) {
    const tier = fitTier(lineup[slot].realPosition, slot);
    breakdown[slot] = tier;
    totalPct += FIT_BONUS[tier];
  }
  return { totalPct, breakdown };
}

function computeEraBonus(lineup, slots) {
  const filled = slots.filter((s) => lineup[s]);
  const distinctDecades = new Set(filled.map((s) => lineup[s].decade)).size;
  return { totalPct: ERA_BONUS_BY_DISTINCT_DECADES[distinctDecades] ?? 0, distinctDecades };
}

function sigmoidWins(composite) {
  const raw = 82 / (1 + Math.exp(-WIN_CURVE_STEEPNESS * (composite - WIN_CURVE_MIDPOINT)));
  return Math.max(0, Math.min(82, Math.round(raw)));
}

export function computeRecord(state, benchEnabled) {
  const slots = lineupSlots(benchEnabled);
  const baseSkillScore = computeBaseSkillScore(state.lineup, slots);
  const fit = computeFitBonus(state.lineup, slots);
  const era = computeEraBonus(state.lineup, slots);
  const variancePct = (Math.random() * 2 - 1) * VARIANCE_RANGE;

  const preVariance = baseSkillScore * Math.max(0, 1 + fit.totalPct + era.totalPct);
  const composite = preVariance * (1 + variancePct);

  const wins = sigmoidWins(composite);
  const losses = 82 - wins;

  return {
    wins,
    losses,
    record: `${wins}-${losses}`,
    breakdown: {
      baseSkillScore: round1(baseSkillScore),
      fitBonusPct: round1(fit.totalPct * 100),
      fitBySlot: fit.breakdown,
      eraBonusPct: round1(era.totalPct * 100),
      distinctDecades: era.distinctDecades,
      variancePct: round1(variancePct * 100),
      composite: round1(composite),
    },
  };
}

export function calculateResults(gameState, players) {
  const connected = players.filter((p) => p.connected);
  const results = {};
  for (const p of connected) {
    const state = gameState.playerBuilds[p.socketId];
    if (!state) continue;
    results[p.socketId] = {
      name: p.name,
      lineup: state.lineup,
      ...computeRecord(state, gameState.benchEnabled),
    };
  }
  gameState.results = results;
  gameState.phase = "resolved";
  return results;
}
