export function createRoomObject({ code, hostSocketId, hostName, gameMode }) {
  const now = Date.now();
  return {
    code,
    hostSocketId,
    gameMode: gameMode || null,
    status: "lobby", // lobby | in-game | finished
    players: [
      {
        socketId: hostSocketId,
        name: hostName,
        isHost: true,
        connected: true,
        joinedAt: now,
      },
    ],
    gameState: null,
    createdAt: now,
    lastActivityAt: now,
  };
}

export function toPublicRoom(room) {
  return {
    code: room.code,
    hostSocketId: room.hostSocketId,
    gameMode: room.gameMode,
    status: room.status,
    players: room.players.map((p) => ({
      socketId: p.socketId,
      name: p.name,
      isHost: p.isHost,
      connected: p.connected,
    })),
    gameState: room.gameState,
  };
}
