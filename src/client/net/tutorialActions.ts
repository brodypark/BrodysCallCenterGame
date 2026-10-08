// Tells the server the player closed How to Play, so it stops opening by itself.

import { socket } from "@client/net/socket";

// Dropped while offline; then it just opens again on the next visit, which is harmless.
export function tutorialSeen(): void {
  if (socket.connected) {
    socket.emit("tutorial:seen");
  }
}
