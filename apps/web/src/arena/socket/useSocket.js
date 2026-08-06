import { useContext } from "react";
import { SocketContext } from "./SocketProvider.jsx";

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within an arena SocketProvider");
  return ctx;
}
