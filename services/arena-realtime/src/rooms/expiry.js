import { config } from "../config.js";
import { allRooms, deleteRoom } from "./roomStore.js";

export function startExpirySweep() {
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of allRooms().entries()) {
      if (now - room.lastActivityAt > config.roomExpiryMs) {
        deleteRoom(code);
      }
    }
  }, config.expirySweepIntervalMs);
}
