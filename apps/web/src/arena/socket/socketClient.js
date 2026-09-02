import { io } from "socket.io-client";

// Vite inlines env vars at BUILD time, so a deployed bundle that was built
// without VITE_ARENA_SERVER_URL has "http://localhost:4000" compiled into it
// permanently -- every visitor's browser then tries to reach a socket server
// on their own machine, and room creation silently does nothing. Setting the
// variable in the host's dashboard only helps if a rebuild follows it.
//
// So the fallback is chosen by where the page is actually being served from
// rather than being localhost unconditionally. The env var still wins when
// it is set, and local development is unchanged.
const DEPLOYED_ARENA_URL = "https://hoopiq-arena.onrender.com";

function defaultArenaUrl() {
  const host = typeof window === "undefined" ? "" : window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  return isLocal ? "http://localhost:4000" : DEPLOYED_ARENA_URL;
}

const ARENA_SERVER_URL = import.meta.env.VITE_ARENA_SERVER_URL || defaultArenaUrl();

let socket;

// Lazily created so visiting the rest of the site never opens a socket
// connection — only mounting an Arena route pays that cost.
export function getArenaSocket() {
  if (!socket) {
    socket = io(ARENA_SERVER_URL, { autoConnect: false });
  }
  return socket;
}
