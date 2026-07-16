import { createRoom, getRoom, touchRoom, deleteRoom } from "../rooms/roomStore.js";
import { toPublicRoom } from "../rooms/Room.js";
import { buildRound } from "../game-logic/overUnder.js";
import {
  initGameState as initClosestToGameState,
  ensurePlayerLineup,
} from "../game-logic/closestTo.js";
import { initGameState as initFiveHintsGameState, startRound as startFiveHintsRound } from "../game-logic/fiveHints.js";
import { sanitizeGameStateForBroadcast } from "../game-logic/sanitize.js";
import { revealRound, armHintPhase as armFiveHintsHintPhase } from "./gameHandlers.js";
import players from "../data/nba_players.json" with { type: "json" };

const DEFAULT_CLOSEST_TO_CONFIG = {
  targetNumber: 100,
  rounds: 1,
  era: "all-time",
  eraStart: null,
  eraEnd: null,
  skipRule: "one-skip",
};

const DEFAULT_FIVE_HINTS_CONFIG = {
  rounds: 10,
  buzzStyle: "competitive",
  hintTiming: "auto",
  poolFilter: "all",
  position: null,
  maxHints: 5,
};

const DEFAULT_OVER_UNDER_CONFIG = {
  rounds: 5,
  timerSeconds: 20,
  statCategory: "career_ppg",
  lineMode: "auto",
  difficulty: "medium",
  manualLine: null,
  poolFilter: "all",
};

function initialGameState(gameMode, configOverrides) {
  if (gameMode === "over-under") {
    const gameConfig = { ...DEFAULT_OVER_UNDER_CONFIG, ...(configOverrides || {}) };
    return {
      config: gameConfig,
      roundIndex: 0,
      scores: {},
      rounds: [],
      usedPairs: [],
      currentRound: null,
    };
  }
  if (gameMode === "closest-to") {
    return initClosestToGameState({ ...DEFAULT_CLOSEST_TO_CONFIG, ...(configOverrides || {}) });
  }
  if (gameMode === "five-hints") {
    return initFiveHintsGameState({ ...DEFAULT_FIVE_HINTS_CONFIG, ...(configOverrides || {}) });
  }
  return { config: configOverrides || {} };
}

export function registerLobbyHandlers(io, socket) {
  socket.on("create_room", ({ playerName, gameMode } = {}, callback) => {
    const name = (playerName || "Host").trim().slice(0, 24) || "Host";
    const room = createRoom({ hostSocketId: socket.id, hostName: name, gameMode });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    callback?.({ roomCode: room.code, room: toPublicRoom(room) });
  });

  socket.on("join_room", ({ roomCode, playerName } = {}, callback) => {
    const room = getRoom(roomCode);
    if (!room) {
      const message = "That room code doesn't exist.";
      socket.emit("join_error", { message });
      callback?.({ error: message });
      return;
    }
    if (room.status !== "lobby") {
      const message = "That game has already started.";
      socket.emit("join_error", { message });
      callback?.({ error: message });
      return;
    }

    const name = (playerName || "Player").trim().slice(0, 24) || "Player";
    room.players.push({
      socketId: socket.id,
      name,
      isHost: false,
      connected: true,
      joinedAt: Date.now(),
    });
    touchRoom(room);
    socket.join(room.code);
    socket.data.roomCode = room.code;

    const publicRoom = toPublicRoom(room);
    io.to(room.code).emit("player_joined", { players: publicRoom.players, newPlayerName: name });
    callback?.({ room: publicRoom });
  });

  socket.on("start_game", ({ roomCode, config: configOverrides } = {}, callback) => {
    const room = getRoom(roomCode);
    if (!room) return callback?.({ error: "Room not found." });
    if (room.hostSocketId !== socket.id) return callback?.({ error: "Only the host can start the game." });
    if (room.players.length < 2) return callback?.({ error: "Need at least 2 players to start." });

    room.status = "in-game";
    room.gameState = initialGameState(room.gameMode, configOverrides);

    if (room.gameMode === "over-under") {
      const round = buildRound({
        pool: players,
        poolFilter: room.gameState.config.poolFilter,
        statCategory: room.gameState.config.statCategory,
        lineMode: room.gameState.config.lineMode,
        difficulty: room.gameState.config.difficulty,
        manualLine: room.gameState.config.manualLine,
        usedPairs: new Set(room.gameState.usedPairs),
      });
      room.gameState.usedPairs.push(round.pairKey);
      room.gameState.currentRound = {
        ...round,
        votes: {},
        revealed: false,
        startedAt: Date.now(),
      };
      // Reveal automatically when the timer runs out, same as if every
      // player had voted.
      room.gameState.currentRound._timeout = setTimeout(() => {
        revealRound(io, room);
      }, room.gameState.config.timerSeconds * 1000);
    }

    if (room.gameMode === "closest-to") {
      // Pre-create an empty lineup entry for every player so the "X of Y
      // done" counter has the right denominator from the very first tick,
      // even before anyone has spun yet.
      for (const player of room.players) {
        ensurePlayerLineup(room.gameState, player.socketId);
      }
    }

    if (room.gameMode === "five-hints") {
      // Round 1 begins atomically as part of start_game itself (same as
      // Over Under and Closest To above) rather than waiting on a
      // follow-up client event -- a client that reloads or a host tab that
      // never fires it should never be able to strand the room on an empty
      // "awaiting_configure" state forever.
      startFiveHintsRound(room.gameState);
    }

    touchRoom(room);
    io.to(room.code).emit("game_update", {
      gameState: sanitizeGameStateForBroadcast(room.gameState),
      status: room.status,
      type: "game_started",
    });

    // Five Hints' round 1 hint-reveal timer can only be armed after the
    // client has the initial state in hand (see armHintPhase's own
    // broadcasts, which are for hint 2+ -- round 1 rides the game_started
    // broadcast above instead of emitting its own).
    if (room.gameMode === "five-hints") {
      armFiveHintsHintPhase(io, room);
    }

    callback?.({ ok: true });
  });

  socket.on("leave_room", ({ roomCode } = {}) => {
    const room = getRoom(roomCode);
    if (!room) return;
    handlePlayerExit(io, room, socket.id);
  });
}

export function handlePlayerExit(io, room, socketId) {
  const player = room.players.find((p) => p.socketId === socketId);
  if (!player) return;

  const wasHost = room.hostSocketId === socketId;
  room.players = room.players.filter((p) => p.socketId !== socketId);

  if (room.players.length === 0) {
    if (room.gameState?.currentRound?._timeout) clearTimeout(room.gameState.currentRound._timeout);
    deleteRoom(room.code);
    return;
  }

  if (wasHost) {
    const nextHost = room.players[0];
    nextHost.isHost = true;
    room.hostSocketId = nextHost.socketId;
    io.to(room.code).emit("host_left", {
      players: toPublicRoom(room).players,
      newHostSocketId: nextHost.socketId,
      newHostName: nextHost.name,
    });
  } else {
    io.to(room.code).emit("player_left", {
      players: toPublicRoom(room).players,
      playerName: player.name,
    });
  }
  touchRoom(room);
}
