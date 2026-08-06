import { Outlet } from "react-router-dom";
import { SocketProvider } from "./socket/SocketProvider.jsx";

// Wraps every /arena/* route in one shared SocketProvider instance so the
// room/socket state survives client-side navigation between the lobby,
// waiting room, and game screens (a fresh SocketProvider per page would lose
// the room the moment you navigate).
export default function ArenaLayout() {
  return (
    <SocketProvider>
      <Outlet />
    </SocketProvider>
  );
}
