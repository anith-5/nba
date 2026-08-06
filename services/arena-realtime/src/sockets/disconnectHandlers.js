import { findRoomBySocketId } from "../rooms/roomStore.js";
import { toPublicRoom } from "../rooms/Room.js";
import { handlePlayerExit } from "./lobbyHandlers.js";

export function registerDisconnectHandlers(io, socket) {
  socket.on("disconnect", () => {
    const room = findRoomBySocketId(socket.id);
    if (!room) return;

    if (room.status === "in-game") {
      // Mid-game: mark the slot disconnected instead of removing the player,
      // so the game continues without crashing and the seat/history stays intact.
      const player = room.players.find((p) => p.socketId === socket.id);
      if (player) player.connected = false;
      if (room.hostSocketId === socket.id) {
        const nextHost = room.players.find((p) => p.connected);
        if (nextHost) {
          nextHost.isHost = true;
          room.hostSocketId = nextHost.socketId;
          io.to(room.code).emit("host_left", {
            players: toPublicRoom(room).players,
            newHostSocketId: nextHost.socketId,
            newHostName: nextHost.name,
          });
        }
      } else {
        io.to(room.code).emit("player_left", {
          players: toPublicRoom(room).players,
          playerName: player?.name,
        });
      }
      return;
    }

    // Still in the lobby: just remove them (they haven't invested game state yet).
    handlePlayerExit(io, room, socket.id);
  });
}
