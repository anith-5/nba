import { createContext, useEffect, useRef, useState } from "react";
import { getArenaSocket } from "./socketClient.js";

export const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const socketRef = useRef(getArenaSocket());
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket.connected) socket.connect();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onPlayerJoined = ({ players }) =>
      setRoom((prev) => (prev ? { ...prev, players } : prev));
    const onPlayerLeft = ({ players }) =>
      setRoom((prev) => (prev ? { ...prev, players } : prev));
    const onHostLeft = ({ players, newHostSocketId }) =>
      setRoom((prev) => (prev ? { ...prev, players, hostSocketId: newHostSocketId } : prev));
    const onGameUpdate = ({ gameState, status }) =>
      setRoom((prev) => (prev ? { ...prev, gameState, status } : prev));
    const onJoinError = ({ message }) => setError(message);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("player_joined", onPlayerJoined);
    socket.on("player_left", onPlayerLeft);
    socket.on("host_left", onHostLeft);
    socket.on("game_update", onGameUpdate);
    socket.on("join_error", onJoinError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("player_joined", onPlayerJoined);
      socket.off("player_left", onPlayerLeft);
      socket.off("host_left", onHostLeft);
      socket.off("game_update", onGameUpdate);
      socket.off("join_error", onJoinError);
    };
  }, []);

  function createRoom(playerName, gameMode) {
    return new Promise((resolve, reject) => {
      socketRef.current.emit("create_room", { playerName, gameMode }, (res) => {
        if (res?.error) {
          setError(res.error);
          reject(new Error(res.error));
          return;
        }
        setRoom(res.room);
        resolve(res.roomCode);
      });
    });
  }

  function joinRoom(roomCode, playerName) {
    return new Promise((resolve, reject) => {
      socketRef.current.emit("join_room", { roomCode, playerName }, (res) => {
        if (res?.error) {
          setError(res.error);
          reject(new Error(res.error));
          return;
        }
        setRoom(res.room);
        resolve(res.room);
      });
    });
  }

  function startGame(config) {
    return new Promise((resolve, reject) => {
      socketRef.current.emit("start_game", { roomCode: room?.code, config }, (res) => {
        if (res?.error) {
          setError(res.error);
          reject(new Error(res.error));
          return;
        }
        resolve(res);
      });
    });
  }

  function sendGameAction(action, data) {
    socketRef.current.emit("game_action", { roomCode: room?.code, action, data });
  }

  function leaveRoom() {
    if (room?.code) socketRef.current.emit("leave_room", { roomCode: room.code });
    setRoom(null);
  }

  const value = {
    socket: socketRef.current,
    connected,
    myId: socketRef.current.id,
    room,
    error,
    setError,
    createRoom,
    joinRoom,
    startGame,
    sendGameAction,
    leaveRoom,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
