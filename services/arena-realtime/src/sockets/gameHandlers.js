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
import {
  startRound as startFiveHintsRoundState,
  advanceHint,
  handleBuzzIn as applyBuzzIn,
  handleCompetitiveGuess,
  recordCasualSubmission,
  resolveCasualHint,
  allCasualSubmitted,
  allLockedOut,
  resolveRoundUnsolved,
  finalizeRoundHistory,
  goToNextRound,
  TIMERS,
} from "../game-logic/fiveHints.js";
import {
  advanceHint as advanceHintAuctionHint,
  openAuction as openHintAuctionAuction,
  placeBid as placeHintAuctionBid,
  resolveAuction as resolveHintAuction,
  finalizeRoundHistory as finalizeHintAuctionRoundHistory,
  goToNextRound as goToNextHintAuctionRound,
  TIMERS as HINT_AUCTION_TIMERS,
} from "../game-logic/hintAuction.js";
import players from "../data/nba_players.json" with { type: "json" };

const NEXT_ROUND_DELAY_MS = 5000;
const CASUAL_REVEAL_PAUSE_MS = 3000;

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
    } else if (room.gameMode === "five-hints") {
      handleFiveHintsAction(io, room, socket, action, data || {});
    } else if (room.gameMode === "hint-auction") {
      handleHintAuctionAction(io, room, socket, action, data || {});
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

// --- Five Hints ---

function connectedSocketIds(room) {
  return room.players.filter((p) => p.connected).map((p) => p.socketId);
}

function clearRoundTimers(round) {
  if (!round) return;
  clearTimeout(round._hintTimeout);
  clearTimeout(round._buzzTimeout);
  clearTimeout(round._casualTimeout);
  clearTimeout(round._revealPauseTimeout);
}

// Arms whatever timer the current sub-phase needs:
//   - Casual mode always runs its own 20s guess-collection window,
//     regardless of the Auto/Host hint-timing setting (that setting only
//     controls whether the NEXT hint appears automatically once this one's
//     guesses are resolved).
//   - Competitive mode only auto-advances the open buzz window on a timer
//     when hint-timing is Auto; Host-Controlled leaves it open indefinitely
//     until the host clicks reveal_hint.
export function armHintPhase(io, room) {
  const gameState = room.gameState;
  const round = gameState.currentRound;
  if (!round || round.resolved) return;

  if (gameState.config.buzzStyle === "casual") {
    round._casualTimeout = setTimeout(() => {
      finishCasualHint(io, room);
    }, TIMERS.CASUAL_GUESS_SECONDS * 1000);
    return;
  }

  if (gameState.config.hintTiming === "auto") {
    round._hintTimeout = setTimeout(() => {
      onCompetitiveHintTimeout(io, room);
    }, TIMERS.HINT_TIMER_SECONDS * 1000);
  }
}

function beginFiveHintsRound(io, room) {
  clearRoundTimers(room.gameState.currentRound);
  touchRoom(room);
  broadcast(io, room, "round_started");
  armHintPhase(io, room);
}

function endRoundUnsolved(io, room) {
  const gameState = room.gameState;
  clearRoundTimers(gameState.currentRound);
  resolveRoundUnsolved(gameState);
  finalizeRoundHistory(gameState);
  touchRoom(room);
  io.to(room.code).emit("round_over", {
    player: gameState.currentRound.player,
    hints: gameState.currentRound.hints,
    winners: [],
  });
  broadcast(io, room, "round_over");
}

function endRoundSolved(io, room) {
  const gameState = room.gameState;
  clearRoundTimers(gameState.currentRound);
  finalizeRoundHistory(gameState);
  touchRoom(room);
  io.to(room.code).emit("round_over", {
    player: gameState.currentRound.player,
    hints: gameState.currentRound.hints,
    winners: gameState.currentRound.winners,
  });
  broadcast(io, room, "round_over");
}

// Competitive, Auto hint-timing: nobody buzzed within the 20s window --
// advance to the next hint, or reveal the answer if that was the last one.
function onCompetitiveHintTimeout(io, room) {
  const gameState = room.gameState;
  const round = gameState.currentRound;
  if (!round || round.resolved || round.subPhase !== "open") return; // stale timer
  advanceToNextHintOrReveal(io, room);
}

function advanceToNextHintOrReveal(io, room) {
  const gameState = room.gameState;
  const advanced = advanceHint(gameState);
  if (!advanced) {
    endRoundUnsolved(io, room);
    return;
  }
  touchRoom(room);
  broadcast(io, room, "hint_revealed");
  armHintPhase(io, room);
}

// A hint's 20s casual-collection window closed (whether by everyone
// submitting early or the timer itself) -- score it and either end the
// round (someone was right) or move on.
function finishCasualHint(io, room) {
  const gameState = room.gameState;
  const round = gameState.currentRound;
  if (!round || round.resolved) return;
  clearTimeout(round._casualTimeout);

  const { winners } = resolveCasualHint(gameState);
  touchRoom(room);
  broadcast(io, room, "hint_results");

  if (winners.length > 0) {
    endRoundSolved(io, room);
    return;
  }

  if (gameState.config.hintTiming === "auto") {
    round._revealPauseTimeout = setTimeout(() => {
      advanceToNextHintOrReveal(io, room);
    }, CASUAL_REVEAL_PAUSE_MS);
  }
  // Host-Controlled: wait for the host's reveal_hint action.
}

function handleFiveHintsAction(io, room, socket, action, data) {
  const gameState = room.gameState;
  if (!gameState) return;

  if (action === "configure_five_hints" && room.hostSocketId === socket.id && gameState.phase === "awaiting_configure") {
    startFiveHintsRoundState(gameState);
    beginFiveHintsRound(io, room);
    return;
  }

  const round = gameState.currentRound;
  if (!round || gameState.phase !== "round_active") return;

  if (action === "buzz_in") {
    const result = applyBuzzIn(gameState, socket.id);
    if (result.error) {
      socket.emit("game_error", { message: result.error });
      return;
    }
    clearTimeout(round._hintTimeout);
    round._buzzTimeout = setTimeout(() => onBuzzTimeout(io, room, socket.id), TIMERS.COMPETITIVE_BUZZ_SECONDS * 1000);
    touchRoom(room);
    const buzzer = room.players.find((p) => p.socketId === socket.id);
    io.to(room.code).emit("buzz_winner", {
      socketId: socket.id,
      name: buzzer?.name,
      hintNumber: result.hintNumber,
      deadlineAt: result.deadlineAt,
    });
    broadcast(io, room, "buzz_winner");
    return;
  }

  if (action === "submit_guess") {
    if (gameState.config.buzzStyle === "competitive") {
      const result = handleCompetitiveGuess(gameState, socket.id, data.guess);
      if (result.error) {
        socket.emit("game_error", { message: result.error });
        return;
      }
      clearTimeout(round._buzzTimeout);
      touchRoom(room);
      socket.emit("guess_result", { correct: result.correct, points: result.points, hintNumber: result.hintNumber });

      if (result.correct) {
        endRoundSolved(io, room);
      } else {
        broadcast(io, room, "guess_wrong");
        if (allLockedOut(round, connectedSocketIds(room))) {
          endRoundUnsolved(io, room);
        } else {
          armHintPhase(io, room);
        }
      }
      return;
    }

    // Casual: guesses stay hidden until the whole hint resolves, so this
    // only ever acknowledges receipt to the submitter -- never correctness.
    const result = recordCasualSubmission(gameState, socket.id, { guess: data.guess, passed: false });
    if (result.error) {
      socket.emit("game_error", { message: result.error });
      return;
    }
    touchRoom(room);
    socket.emit("guess_submitted", { hintNumber: round.hintNumber });
    broadcast(io, room, "guess_submitted");
    if (allCasualSubmitted(round, connectedSocketIds(room))) {
      io.to(room.code).emit("all_passed");
      finishCasualHint(io, room);
    }
    return;
  }

  if (action === "pass_turn") {
    const result = recordCasualSubmission(gameState, socket.id, { passed: true });
    if (result.error) {
      socket.emit("game_error", { message: result.error });
      return;
    }
    touchRoom(room);
    broadcast(io, room, "guess_submitted");
    if (allCasualSubmitted(round, connectedSocketIds(room))) {
      io.to(room.code).emit("all_passed");
      finishCasualHint(io, room);
    }
    return;
  }

  if (action === "reveal_hint" && room.hostSocketId === socket.id && gameState.config.hintTiming === "host") {
    if (gameState.config.buzzStyle === "competitive" && round.subPhase !== "open") return;
    if (gameState.config.buzzStyle === "casual" && round.lastHintReveal?.hintNumber !== round.hintNumber) return;
    clearRoundTimers(round);
    advanceToNextHintOrReveal(io, room);
    return;
  }

  if (action === "next_round" && room.hostSocketId === socket.id && round.resolved) {
    const advanced = goToNextRound(gameState);
    if (!advanced) {
      room.status = "finished";
      touchRoom(room);
      broadcast(io, room, "game_finished");
      return;
    }
    beginFiveHintsRound(io, room);
  }
}

function onBuzzTimeout(io, room, socketId) {
  const gameState = room.gameState;
  const round = gameState.currentRound;
  if (!round || round.resolved || round.subPhase !== "buzzed" || round.activeBuzzerSocketId !== socketId) return; // stale
  const result = handleCompetitiveGuess(gameState, socketId, "");
  touchRoom(room);
  io.to(socketId).emit("guess_result", { correct: false, points: result.points, hintNumber: result.hintNumber, timedOut: true });
  broadcast(io, room, "guess_wrong");
  if (allLockedOut(round, connectedSocketIds(room))) {
    endRoundUnsolved(io, room);
  } else {
    armHintPhase(io, room);
  }
}

// --- Hint Auction ---
//
// Unlike Five Hints, there's no buzz/guess to wait on -- hints reveal on a
// steady clock, then the auction opens on its own timer (extended a few
// seconds on every valid bid, up to a host-configured cap), and once it
// closes the round auto-resolves and auto-advances with no host action
// required at any step. A many-round auction draft (total rounds scale with
// lobby size -- see hintAuction.js's beginGame) would make a host-click
// gate on every single round a real drag, so pacing here is fully
// server-driven, the same way Over Under's reveal-then-advance loop is.
const HINT_AUCTION_ROUND_PAUSE_MS = 6000;

function clearHintAuctionTimers(round) {
  if (!round) return;
  clearTimeout(round._hintTimeout);
  clearTimeout(round._auctionTimeout);
  clearTimeout(round._nextRoundTimeout);
}

export function armHintAuctionHintPhase(io, room) {
  const gameState = room.gameState;
  const round = gameState.currentRound;
  if (!round || round.resolved || round.subPhase !== "hints") return;
  round._hintTimeout = setTimeout(() => onHintAuctionHintTimeout(io, room), HINT_AUCTION_TIMERS.HINT_REVEAL_SECONDS * 1000);
}

function onHintAuctionHintTimeout(io, room) {
  const gameState = room.gameState;
  const round = gameState.currentRound;
  if (!round || round.resolved || round.subPhase !== "hints") return; // stale timer

  const advanced = advanceHintAuctionHint(gameState);
  touchRoom(room);
  if (advanced) {
    broadcast(io, room, "hint_revealed");
    armHintAuctionHintPhase(io, room);
    return;
  }
  beginHintAuctionAuction(io, room);
}

function beginHintAuctionAuction(io, room) {
  const gameState = room.gameState;
  openHintAuctionAuction(gameState);
  touchRoom(room);
  broadcast(io, room, "auction_open");
  armHintAuctionAuctionTimer(io, room);
}

function armHintAuctionAuctionTimer(io, room) {
  const round = room.gameState.currentRound;
  clearTimeout(round._auctionTimeout);
  const msRemaining = Math.max(0, round.auctionDeadlineAt - Date.now());
  round._auctionTimeout = setTimeout(() => onHintAuctionAuctionTimeout(io, room), msRemaining);
}

function onHintAuctionAuctionTimeout(io, room) {
  const gameState = room.gameState;
  const round = gameState.currentRound;
  if (!round || round.resolved || round.subPhase !== "auction") return; // stale timer

  // A bid's extension can move auctionDeadlineAt further out than this
  // exact timer instance is still counting down to (the normal case
  // re-arms a fresh setTimeout on every bid, but a timer already queued a
  // tick before an extension lands can still fire slightly early) -- if the
  // real deadline hasn't actually passed yet, just re-arm instead of
  // resolving prematurely.
  if (Date.now() < round.auctionDeadlineAt) {
    armHintAuctionAuctionTimer(io, room);
    return;
  }

  const result = resolveHintAuction(gameState);
  finalizeHintAuctionRoundHistory(gameState);
  touchRoom(room);
  io.to(room.code).emit("auction_resolved", result);
  broadcast(io, room, "auction_resolved");

  round._nextRoundTimeout = setTimeout(() => advanceHintAuctionRoundOrEnd(io, room), HINT_AUCTION_ROUND_PAUSE_MS);
}

function advanceHintAuctionRoundOrEnd(io, room) {
  const gameState = room.gameState;
  const advanced = goToNextHintAuctionRound(gameState);
  if (!advanced) {
    room.status = "finished";
    touchRoom(room);
    broadcast(io, room, "game_finished");
    return;
  }
  clearHintAuctionTimers(gameState.currentRound);
  touchRoom(room);
  broadcast(io, room, "round_started");
  armHintAuctionHintPhase(io, room);
}

function handleHintAuctionAction(io, room, socket, action, data) {
  const gameState = room.gameState;
  if (!gameState) return;
  const round = gameState.currentRound;
  if (!round || gameState.phase !== "round_active") return;

  if (action === "place_bid") {
    const result = placeHintAuctionBid(gameState, socket.id, data.amount);
    if (result.error) {
      socket.emit("game_error", { message: result.error });
      return;
    }
    touchRoom(room);
    broadcast(io, room, "bid_placed");
    if (result.extended) armHintAuctionAuctionTimer(io, room);
  }
}
