// Server-authoritative game logic for Closest To — a starting-lineup builder.
// Each player independently spins a wheel of the 30 NBA teams, picks a
// player + season from whichever team they land on, and tries to build a
// 5-position lineup (PG/SG/SF/PF/C) whose combined PPG gets as close to the
// host's target as possible without going over.
//
// This is "Blind Mode": PPG is never sent to any client during lineup
// building, only at the reveal that fires once every player has confirmed
// all 5 picks (see handleConfirmPick/publicLineupState below, and
// gameHandlers.js's reveal_lineups emission). The server tracks the real
// PPG internally the whole time — it looks up whatever the client picks
// (team + player + season) against its own trusted data rather than
// trusting any client-submitted value — it just doesn't tell anyone the
// number until the round is over.
import playerSeasonsByTeam from "../data/nba_player_seasons.json" with { type: "json" };
import { getTeamPlayers, getResolvedTeamPlayers } from "../data/teamPlayersCache.js";

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const TEAM_ABBREVIATIONS = Object.keys(playerSeasonsByTeam);

function round1(n) {
  return Math.round(n * 10) / 10;
}

function seasonStartYear(season) {
  return parseInt(season.slice(0, 4), 10);
}

function seasonMatchesEra(season, era, eraStart, eraEnd) {
  const year = seasonStartYear(season);
  if (era === "modern") return year >= 2015;
  if (era === "classic") return year < 2000;
  if (era === "custom") return year >= (eraStart ?? 0) && year <= (eraEnd ?? 9999);
  return true; // all-time
}

// The wheel's "does this team have anywhere left for me to pick" check stays
// on the lightweight static file rather than the (potentially much larger,
// possibly-still-loading) live roster data — it only needs to know whether
// at least one open-position player exists, not the full browsable list.
function eligibleEntriesForTeam(teamAbbr, era, eraStart, eraEnd, lineup) {
  const team = playerSeasonsByTeam[teamAbbr];
  if (!team) return [];
  const entries = [];
  for (const player of team.players) {
    for (const s of player.seasons) {
      if (!seasonMatchesEra(s.season, era, eraStart, eraEnd)) continue;
      if (lineup[s.position]) continue; // that slot is already filled
      entries.push({ player, season: s });
    }
  }
  return entries;
}

function pickRandomTeamWithOpenPosition(gameConfig, lineup) {
  const { era, eraStart, eraEnd } = gameConfig;
  const openPositions = POSITIONS.filter((p) => !lineup[p]);
  if (openPositions.length === 0) return null;

  const maxAttempts = TEAM_ABBREVIATIONS.length * 3;
  for (let i = 0; i < maxAttempts; i++) {
    const abbr = TEAM_ABBREVIATIONS[Math.floor(Math.random() * TEAM_ABBREVIATIONS.length)];
    const entries = eligibleEntriesForTeam(abbr, era, eraStart, eraEnd, lineup);
    if (entries.length > 0) {
      return { abbr, teamName: playerSeasonsByTeam[abbr].team_name };
    }
  }
  // Extremely unlikely fallback: scan every team for the first one that works.
  for (const abbr of TEAM_ABBREVIATIONS) {
    const entries = eligibleEntriesForTeam(abbr, era, eraStart, eraEnd, lineup);
    if (entries.length > 0) return { abbr, teamName: playerSeasonsByTeam[abbr].team_name };
  }
  return null;
}

// "Jr."/"II"/"III" suffixes shouldn't be treated as the last name for
// alphabetical sorting purposes.
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

// Resolves the full (live-if-ready, else static-fallback) roster for a team
// — this is what powers the searchable/scrollable player list. Combines
// multi-stint players (already deduped by player_id upstream), sorts by
// last name, and attaches each player's primary position. No PPG here —
// Blind Mode only reveals PPG at the end of the round.
export async function resolveTeamRoster(teamAbbr) {
  const data = await getTeamPlayers(teamAbbr);
  return data;
}

// A season only shows up as a selectable option once its PPG has been
// confirmed by a real (non-throttled, non-failed) stats response — see
// team_players.py's ppg_confirmed field. A player can still appear in the
// browsable list with zero confirmed seasons (e.g. every one of their
// seasons got caught in a stats.nba.com throttling window); the frontend
// shows a "stats unavailable" message rather than an empty/broken picker.
export function buildSelectionList(rosterData, era, eraStart, eraEnd) {
  const players = (rosterData?.players || [])
    .map((p) => {
      const eraSeasons = p.seasons.filter((s) => seasonMatchesEra(s.season, era, eraStart, eraEnd));
      const confirmedSeasons = eraSeasons
        .filter((s) => s.ppg_confirmed)
        .sort((a, b) => b.season.localeCompare(a.season));
      return { name: p.name, player_id: p.player_id, eraSeasons, confirmedSeasons };
    })
    .filter((p) => p.eraSeasons.length > 0);

  players.sort((a, b) => lastNameKey(a.name).localeCompare(lastNameKey(b.name)));

  return players.map((p) => ({
    name: p.name,
    player_id: p.player_id,
    position: primaryPosition(p.eraSeasons),
    // Client-facing seasons carry year + that season's position only — no
    // PPG. Blind Mode.
    seasons: p.confirmedSeasons.map((s) => ({ season: s.season, position: s.position })),
  }));
}

// Looks up the real, server-trusted season entry (including PPG) for a
// confirm_pick request against whatever roster source (live or static
// fallback) was actually resolved for this team — the client only tells us
// WHICH player/season it wants, never the PPG itself.
export function findSeasonEntry(teamAbbr, playerId, season) {
  const resolved = getResolvedTeamPlayers(teamAbbr);
  const player = resolved?.players?.find((p) => p.player_id === playerId);
  if (!player) return null;
  const seasonEntry = player.seasons.find((s) => s.season === season);
  if (!seasonEntry || !seasonEntry.ppg_confirmed) return null;
  return { name: player.name, playerId: player.player_id, ...seasonEntry };
}

export function initGameState(settings) {
  return {
    target: settings.targetNumber,
    era: settings.era || "all-time",
    eraStart: settings.eraStart ?? null,
    eraEnd: settings.eraEnd ?? null,
    totalRounds: settings.rounds,
    roundNumber: 1,
    skipRule: settings.skipRule === "no-skips" ? "no-skips" : "one-skip",
    phase: "building", // building | round_results | game_over
    scores: {},
    playerLineups: {},
    roundResults: [],
  };
}

function emptyLineup() {
  return { PG: null, SG: null, SF: null, PF: null, C: null };
}

export function ensurePlayerLineup(gameState, socketId) {
  if (!gameState.playerLineups[socketId]) {
    gameState.playerLineups[socketId] = {
      lineup: emptyLineup(),
      total: 0,
      filledCount: 0,
      skipUsed: false,
      pendingTeam: null,
      done: false,
    };
  }
  return gameState.playerLineups[socketId];
}

export function handleSpin(gameState, socketId) {
  const state = ensurePlayerLineup(gameState, socketId);
  if (state.done) return { error: "Lineup already complete." };
  const team = pickRandomTeamWithOpenPosition(gameState, state.lineup);
  if (!team) return { error: "No eligible teams remain." };
  state.pendingTeam = team;
  return { ok: true, team };
}

export function handleUseSkip(gameState, socketId) {
  const state = ensurePlayerLineup(gameState, socketId);
  if (state.done) return { error: "Lineup already complete." };
  if (gameState.skipRule === "no-skips") return { error: "Skips are disabled for this game." };
  if (state.skipUsed) return { error: "Skip already used." };
  state.skipUsed = true;
  const team = pickRandomTeamWithOpenPosition(gameState, state.lineup);
  if (!team) return { error: "No eligible teams remain." };
  state.pendingTeam = team;
  return { ok: true, team };
}

export function handleConfirmPick(gameState, socketId, { playerId, season, position }) {
  const state = ensurePlayerLineup(gameState, socketId);
  if (state.done) return { error: "Lineup already complete." };
  if (!state.pendingTeam) return { error: "No active spin to confirm a pick for." };
  if (state.lineup[position]) return { error: "That position is already filled." };

  const entry = findSeasonEntry(state.pendingTeam.abbr, playerId, season);
  if (!entry || entry.position !== position) return { error: "Invalid player/season/position for this team." };
  if (!seasonMatchesEra(entry.season, gameState.era, gameState.eraStart, gameState.eraEnd)) {
    return { error: "That season is outside the selected era." };
  }

  state.lineup[position] = {
    name: entry.name,
    playerId: entry.playerId,
    team: state.pendingTeam.abbr,
    teamName: state.pendingTeam.teamName,
    season: entry.season,
    ppg: entry.ppg,
  };
  state.total = round1(state.total + entry.ppg);
  state.filledCount += 1;
  state.pendingTeam = null;
  if (state.filledCount >= 5) state.done = true;

  return { ok: true, state };
}

// Blind Mode: strips PPG (and the running total, which is derived purely
// from PPG) before a per-player lineup state is sent to any client, whether
// that's the owning player's own private pick_confirmed echo or anything
// broadcast room-wide. Only reveal_lineups (after everyone finishes) sends
// real numbers — see calculateRoundResults, whose entries are used for that
// event untouched.
export function publicLineupState(state) {
  const lineup = {};
  for (const pos of POSITIONS) {
    const filled = state.lineup[pos];
    lineup[pos] = filled ? { name: filled.name, team: filled.team, teamName: filled.teamName, season: filled.season } : null;
  }
  return { lineup, filledCount: state.filledCount, skipUsed: state.skipUsed, done: state.done };
}

export function allPlayersDone(gameState, connectedSocketIds) {
  return (
    connectedSocketIds.length > 0 &&
    connectedSocketIds.every((id) => gameState.playerLineups[id]?.done)
  );
}

const TIER_POINTS = [5, 3, 2];
const PARTICIPATION_POINTS = 1;

export function calculateRoundResults(gameState, players) {
  const connected = players.filter((p) => p.connected);
  const raw = connected.map((p) => {
    const state = gameState.playerLineups[p.socketId] || { lineup: emptyLineup(), total: 0 };
    const overTarget = state.total > gameState.target;
    const distance = round1(Math.abs(gameState.target - state.total));
    return {
      socketId: p.socketId,
      name: p.name,
      lineup: state.lineup,
      total: state.total,
      distance,
      overTarget,
      perfect: state.total === gameState.target,
    };
  });

  const underOrAt = raw.filter((e) => !e.overTarget).sort((a, b) => a.distance - b.distance);
  const over = raw.filter((e) => e.overTarget);

  let bucketIndex = 0;
  let prevEntry = null;
  for (const entry of underOrAt) {
    if (prevEntry && entry.distance === prevEntry.distance) {
      entry.points = prevEntry.points;
    } else {
      entry.points = TIER_POINTS[bucketIndex] ?? PARTICIPATION_POINTS;
      bucketIndex++;
    }
    prevEntry = entry;
  }
  for (const entry of over) entry.points = 0;

  const entries = [...underOrAt, ...over];
  for (const entry of entries) {
    gameState.scores[entry.socketId] = (gameState.scores[entry.socketId] || 0) + entry.points;
  }
  gameState.roundResults.push({ round: gameState.roundNumber, entries });
  return { entries };
}

export function resetForNextRound(gameState) {
  gameState.roundNumber += 1;
  gameState.phase = "building";
  gameState.playerLineups = {};
}

export function bestRoundFor(gameState, socketId) {
  let best = null;
  for (const round of gameState.roundResults) {
    const entry = round.entries.find((e) => e.socketId === socketId);
    if (entry && (!best || entry.points > best.points)) best = entry;
  }
  return best;
}
