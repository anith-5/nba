import { registerLobbyHandlers } from "./lobbyHandlers.js";
import { registerGameHandlers } from "./gameHandlers.js";
import { registerDisconnectHandlers } from "./disconnectHandlers.js";

export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    registerLobbyHandlers(io, socket);
    registerGameHandlers(io, socket);
    registerDisconnectHandlers(io, socket);
  });
}
