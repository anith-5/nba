import { getRoom, touchRoom } from "../rooms/roomStore.js";
import { buildRound, scoreRound } from "../game-logic/overUnder.js";
import { sanitizeGameStateForBroadcast } from "../game-logic/sanitize.js";
import {
  resolveTeamRoster,
  buildSelectionList,
  handleSpin,
  handleUseSkip,
  handleConfirmPick,
  publicLineupState,
  allPlayersDone,
  calculateRoundResults,
  resetForNextRound,
} from "../game-logic/closestTo.js";
import players from "../data/nba_players.json" with { type: "json" };

const NEXT_ROUND_DELAY_MS = 5000;

export function registerGameHandlers(io, socket) {
  socket.on("game_action", ({ roomCode, action, data } = {}) => {
    const room = getRoom(roomCode);
    if (!room || room.status !== "in-game") return;

    if (room.gameMode === "over-under") {
      handleOverUnderAction(io, room, socket, action, data || {});
    } else if (room.gameMode === "closest-to") {
      handleClosestToAction(io, room, socket, action, data || {}).catch((err) => {
        console.error("[closest-to] action handler error:", err);
        socket.emit("game_error", { message: "Something went wrong processing that action." });
      });
    }
  });
}

function handleOverUnderAction(io, room, socket, action, data) {
  const round = room.gameState?.currentRound;

  if (action === "submit_vote" && round && !round.revealed) {
    if (data.vote !== "over" && data.vote !== "under") return;
    round.votes[socket.id] = data.vote;
    touchRoom(room);

    const connectedIds = room.players.filter((p) => p.connected).map((p) => p.socketId);
    const allVoted = connectedIds.every((id) => round.votes[id]);
    if (allVoted) {
      revealRound(io, room);
    } else {
      broadcast(io, room, "vote_recorded");
    }
    return;
  }

  if (action === "request_next_round" && room.hostSocketId === socket.id) {
    advanceRound(io, room);
  }
}

export function revealRound(io, room) {
  const round = room.gameState?.currentRound;
  if (!round || round.revealed) return;
  clearTimeout(round._timeout);

  const { correctSocketIds, soleBonusSocketId, pointsBySocketId } = scoreRound(
    round.votes,
    round.actualValue,
    round.line
  );

  for (const [socketId, points] of Object.entries(pointsBySocketId)) {
    room.gameState.scores[socketId] = (room.gameState.scores[socketId] || 0) + points;
  }

  round.revealed = true;
  round.correctSocketIds = correctSocketIds;
  round.soleBonusSocketId = soleBonusSocketId;
  round.pointsBySocketId = pointsBySocketId;

  room.gameState.rounds.push({
    player: round.player,
    statLabel: round.statLabel,
    statFormat: round.statFormat,
    line: round.line,
    actualValue: round.actualValue,
    votes: round.votes,
    correctSocketIds,
    soleBonusSocketId,
  });

  touchRoom(room);
  broadcast(io, room, "round_revealed");

  round._nextTimeout = setTimeout(() => advanceRound(io, room), NEXT_ROUND_DELAY_MS);
}

export function advanceRound(io, room) {
  const gameState = room.gameState;
  if (!gameState) return;
  if (gameState.currentRound?._nextTimeout) clearTimeout(gameState.currentRound._nextTimeout);
  if (gameState.currentRound?._timeout) clearTimeout(gameState.currentRound._timeout);

  gameState.roundIndex += 1;
  if (gameState.roundIndex >= gameState.config.rounds) {
    room.status = "finished";
    gameState.currentRound = null;
    touchRoom(room);
    broadcast(io, room, "game_finished");
    return;
  }

  const round = buildRound({
    pool: players,
    poolFilter: gameState.config.poolFilter,
    statCategory: gameState.config.statCategory,
    lineMode: gameState.config.lineMode,
    difficulty: gameState.config.difficulty,
    manualLine: gameState.config.manualLine,
    usedPairs: new Set(gameState.usedPairs),
  });
  gameState.usedPairs.push(round.pairKey);
  gameState.currentRound = {
    ...round,
    votes: {},
    revealed: false,
    startedAt: Date.now(),
  };
  gameState.currentRound._timeout = setTimeout(() => {
    revealRound(io, room);
  }, gameState.config.timerSeconds * 1000);

  touchRoom(room);
  broadcast(io, room, "round_started");
}

function broadcast(io, room, type) {
  io.to(room.code).emit("game_update", {
    gameState: sanitizeGameStateForBroadcast(room.gameState),
    status: room.status,
    type,
  });
}

// --- Closest To ---

function finishRoundIfAllDone(io, room) {
  const gameState = room.gameState;
  const connectedIds = room.players.filter((p) => p.connected).map((p) => p.socketId);
  if (allPlayersDone(gameState, connectedIds)) {
    const { entries } = calculateRoundResults(gameState, room.players);
    // Blind Mode reveal: this is the one moment PPG/totals go out to
    // everyone — the room-wide game_update broadcasts before this point
    // never carried PPG (see sanitize.js), and pick_confirmed only ever
    // sent the requesting player their own name/season/position, never PPG.
    io.to(room.code).emit("reveal_lineups", { entries });
    gameState.phase = "round_results";
    broadcast(io, room, "round_results");
  }
}

async function handleClosestToAction(io, room, socket, action, data) {
  const gameState = room.gameState;
  if (!gameState) return;

  if (action === "spin_team" && gameState.phase === "building") {
    const result = handleSpin(gameState, socket.id);
    if (result.error) {
      socket.emit("game_error", { message: result.error });
      return;
    }
    touchRoom(room);
    socket.emit("spin_result", { team: result.team });
    return;
  }

  if (action === "use_skip" && gameState.phase === "building") {
    const result = handleUseSkip(gameState, socket.id);
    if (result.error) {
      socket.emit("game_error", { message: result.error });
      return;
    }
    touchRoom(room);
    socket.emit("spin_result", { team: result.team, skipUsed: true });
    return;
  }

  if (action === "list_team_players" && gameState.phase === "building") {
    const state = gameState.playerLineups[socket.id];
    if (!state?.pendingTeam) return;
    const teamAbbr = state.pendingTeam.abbr;

    let rosterData;
    try {
      rosterData = await resolveTeamRoster(teamAbbr);
    } catch (err) {
      console.warn(`[closest-to] roster fetch failed for ${teamAbbr}: ${err.message}`);
      // Same staleness guard as the success path below -- don't tell them
      // about a failure for a team they've since skipped away from.
      const stillOnSameTeamAfterError = gameState.playerLineups[socket.id]?.pendingTeam?.abbr === teamAbbr;
      if (stillOnSameTeamAfterError) {
        socket.emit("team_players_error", {
          team: state.pendingTeam,
          message: "Could not load player data for this team. Please use your skip to try another team.",
        });
      }
      return;
    }

    // The player may have skipped/re-spun to a different team while the
    // (possibly slow, live) roster fetch was in flight -- don't hand them a
    // stale team's roster if they've since moved on.
    const stillOnSameTeam = gameState.playerLineups[socket.id]?.pendingTeam?.abbr === teamAbbr;
    if (!stillOnSameTeam) return;

    const options = buildSelectionList(rosterData, gameState.era, gameState.eraStart, gameState.eraEnd);
    socket.emit("team_players_list", {
      team: state.pendingTeam,
      players: options,
      source: rosterData.source,
      dataComplete: rosterData.data_complete,
      note: rosterData.note || null,
    });
    return;
  }

  if (action === "confirm_pick" && gameState.phase === "building") {
    const result = handleConfirmPick(gameState, socket.id, data || {});
    if (result.error) {
      socket.emit("game_error", { message: result.error });
      return;
    }
    touchRoom(room);
    socket.emit("pick_confirmed", { state: publicLineupState(result.state) });

    if (result.state.done) {
      broadcast(io, room, "lineup_complete");
      finishRoundIfAllDone(io, room);
    } else {
      broadcast(io, room, "lineup_progress");
    }
    return;
  }

  if (action === "next_round" && room.hostSocketId === socket.id && gameState.phase === "round_results") {
    if (gameState.roundNumber >= gameState.totalRounds) {
      room.status = "finished";
      touchRoom(room);
      broadcast(io, room, "game_finished");
      return;
    }
    resetForNextRound(gameState);
    touchRoom(room);
    broadcast(io, room, "round_started");
  }
}
