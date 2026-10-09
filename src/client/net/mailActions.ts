// Tells the server the player opened an email. Intent only: the server checks it's theirs.

import { socket } from "@client/net/socket";

// Dropped while offline; it stays unread until it's opened again, which is harmless.
export function readMail(id: number): void {
  if (socket.connected) {
    socket.emit("mail:read", { id });
  }
}
