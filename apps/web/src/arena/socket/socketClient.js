import { io } from "socket.io-client";

const ARENA_SERVER_URL = import.meta.env.VITE_ARENA_SERVER_URL || "http://localhost:4000";

let socket;

// Lazily created so visiting the rest of the site never opens a socket
// connection — only mounting an Arena route pays that cost.
export function getArenaSocket() {
  if (!socket) {
    socket = io(ARENA_SERVER_URL, { autoConnect: false });
  }
  return socket;
}
