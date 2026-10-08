// What the player can ask the server to do with their shift. Intent only.

import { socket } from "@client/net/socket";

export function clockIn(): void {
  if (socket.connected) {
    socket.emit("shift:clockIn");
  }
}

/** The player closed the shift report, so the server needn't send it again. */
export function resultSeen(): void {
  if (socket.connected) {
    socket.emit("shift:resultSeen");
  }
}
