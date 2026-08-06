import { createRoomObject } from "./Room.js";
import { generateRoomCode } from "../utils/roomCode.js";

const rooms = new Map();

export function createRoom({ hostSocketId, hostName, gameMode }) {
  const code = generateRoomCode(rooms);
  const room = createRoomObject({ code, hostSocketId, hostName, gameMode });
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get((code || "").toUpperCase());
}

export function deleteRoom(code) {
  rooms.delete(code);
}

export function touchRoom(room) {
  room.lastActivityAt = Date.now();
}

export function findRoomBySocketId(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.socketId === socketId)) {
      return room;
    }
  }
  return undefined;
}

export function allRooms() {
  return rooms;
}
