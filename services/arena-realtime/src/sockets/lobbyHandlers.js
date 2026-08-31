import { createRoom, getRoom, touchRoom, deleteRoom } from "../rooms/roomStore.js";
import { toPublicRoom } from "../rooms/Room.js";
import { buildRound } from "../game-logic/overUnder.js";
import {
  initGameState as initClosestToGameState,
  ensurePlayerLineup,
} from "../game-logic/closestTo.js";
import { initGameState as initEightyTwoOhGameState, ensurePlayerBuild } from "../game-logic/eightyTwoOh.js";
import { initGameState as initFiveHintsGameState, startRound as startFiveHintsRound } from "../game-logic/fiveHints.js";
import { initGameState as initHintAuctionGameState, beginGame as beginHintAuctionGame } from "../game-logic/hintAuction.js";
import { initGameState as initThemedDraftGameState, beginDraft as beginThemedDraftGame } from "../game-logic/themedDraft.js";
import { initGameState as initBuildAPlayerGameState, beginGame as beginBuildAPlayerGame } from "../game-logic/buildAPlayer.js";
import { sanitizeGameStateForBroadcast } from "../game-logic/sanitize.js";
import {
  revealRound,
  armHintPhase as armFiveHintsHintPhase,
  armHintAuctionHintPhase,
  armThemedDraftTurnTimer,
  armBuildAPlayerPickTimer,
} from "./gameHandlers.js";
import players from "../data/nba_players.json" with { type: "json" };
import {
  allowEvent,
  cleanName,
  isValidRoomCode,
  sanitizeConfig,
  MAX_PLAYERS_PER_ROOM,
  MAX_ROOMS_PER_SOCKET,
} from "../security/guards.js";

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

const DEFAULT_HINT_AUCTION_CONFIG = {
  budget: 100,
  benchEnabled: false,
  hintMode: "standard",
  hintCount: 7,
  auctionTimerSeconds: 20,
  extensionsEnabled: true,
  extensionSeconds: 5,
  maxExtensions: 5,
  poolFilter: "all",
  position: null,
  era: "all-time",
};

const DEFAULT_THEMED_DRAFT_CONFIG = {
  category: "team",
  secondaryParam: { team: "LAL" },
  rosterSize: 5,
  turnTimerSeconds: 30,
};

const DEFAULT_BUILD_A_PLAYER_CONFIG = {
  traitSlotCount: 12,
  pickTimerSeconds: 30,
};

const DEFAULT_EIGHTY_TWO_OH_CONFIG = {
  benchEnabled: false,
};

function initialGameState(gameMode, configOverrides) {
  if (gameMode === "over-under") {
    const gameConfig = sanitizeConfig(DEFAULT_OVER_UNDER_CONFIG, configOverrides);
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
    return initClosestToGameState(sanitizeConfig(DEFAULT_CLOSEST_TO_CONFIG, configOverrides));
  }
  if (gameMode === "five-hints") {
    return initFiveHintsGameState(sanitizeConfig(DEFAULT_FIVE_HINTS_CONFIG, configOverrides));
  }
  if (gameMode === "hint-auction") {
    return initHintAuctionGameState(sanitizeConfig(DEFAULT_HINT_AUCTION_CONFIG, configOverrides));
  }
  if (gameMode === "draft") {
    return initThemedDraftGameState(sanitizeConfig(DEFAULT_THEMED_DRAFT_CONFIG, configOverrides));
  }
  if (gameMode === "build-a-player") {
    return initBuildAPlayerGameState(sanitizeConfig(DEFAULT_BUILD_A_PLAYER_CONFIG, configOverrides));
  }
  if (gameMode === "82-0") {
    return initEightyTwoOhGameState(sanitizeConfig(DEFAULT_EIGHTY_TWO_OH_CONFIG, configOverrides));
  }
  // Unknown mode: no defaults to validate against, so keep nothing.
  return { config: {} };
}

export function registerLobbyHandlers(io, socket) {
  socket.on("create_room", ({ playerName, gameMode } = {}, callback) => {
    if (!allowEvent(socket)) return callback?.({ error: "Slow down a moment." });

    // Rooms live in memory until they expire, so one socket spamming
    // create_room is a memory-exhaustion button.
    const owned = socket.data._roomsCreated || 0;
    if (owned >= MAX_ROOMS_PER_SOCKET) {
      return callback?.({ error: "You already have too many open rooms." });
    }
    socket.data._roomsCreated = owned + 1;

    const name = cleanName(playerName, "Host");
    const room = createRoom({ hostSocketId: socket.id, hostName: name, gameMode });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    callback?.({ roomCode: room.code, room: toPublicRoom(room) });
  });

  socket.on("join_room", ({ roomCode, playerName } = {}, callback) => {
    if (!allowEvent(socket)) return callback?.({ error: "Slow down a moment." });

    // Reject malformed codes before touching the store -- this is also the
    // shape a brute-force scan would iterate over.
    if (!isValidRoomCode(roomCode)) {
      const message = "That room code doesn't exist.";
      socket.emit("join_error", { message });
      return callback?.({ error: message });
    }

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

    if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
      const message = "That room is full.";
      socket.emit("join_error", { message });
      return callback?.({ error: message });
    }

    const name = cleanName(playerName, "Player");
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
    if (!allowEvent(socket)) return callback?.({ error: "Slow down a moment." });
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

    if (room.gameMode === "hint-auction") {
      // beginGame also sets up every connected player's roster/budget and
      // computes totalRounds from the connected player count (one shared
      // mystery player is auctioned per round, so filling N players' Y-slot
      // rosters takes N*Y rounds) before starting round 1 -- same
      // starts-atomically rationale as Five Hints above.
      beginHintAuctionGame(
        room.gameState,
        room.players.map((p) => p.socketId)
      );
    }

    if (room.gameMode === "82-0") {
      // Pre-create an empty build entry for every player so any "X of Y
      // done" style counter has the right denominator from the very first
      // tick, even before anyone has spun -- same reasoning as Closest To's
      // identical pre-creation of ensurePlayerLineup above.
      for (const player of room.players) {
        ensurePlayerBuild(room.gameState, player.socketId);
      }
    }

    if (room.gameMode === "draft") {
      // beginDraft resolves the theme's pool once and sets up every
      // connected player's empty roster + the full snake pick sequence
      // before round 1 -- same starts-atomically rationale as Five Hints
      // and Hint Auction above.
      beginThemedDraftGame(
        room.gameState,
        room.players.map((p) => p.socketId)
      );
    }

    if (room.gameMode === "build-a-player") {
      // beginGame sets up every connected player's empty build and reveals
      // round 1's player -- same starts-atomically rationale as every other
      // mode above.
      beginBuildAPlayerGame(
        room.gameState,
        room.players.map((p) => p.socketId)
      );
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

    if (room.gameMode === "hint-auction") {
      armHintAuctionHintPhase(io, room);
    }

    if (room.gameMode === "draft") {
      armThemedDraftTurnTimer(io, room);
    }

    if (room.gameMode === "build-a-player") {
      armBuildAPlayerPickTimer(io, room);
    }

    callback?.({ ok: true });
  });

  socket.on("leave_room", ({ roomCode } = {}) => {
    if (!allowEvent(socket)) return;
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
