// What the player can ask the server to do with their save slots. Intent only: the server
// checks each one (e.g. never deleting the save being played).

import { socket } from "@client/net/socket";

export function continueSave(slot: number): void {
  if (socket.connected) {
    socket.emit("saves:continue", { slot });
  }
}

/** Returns whether the request was sent (not while offline). */
export function newSave(slot: number): boolean {
  if (!socket.connected) {
    return false;
  }
  socket.emit("saves:new", { slot });
  return true;
}

export function deleteSave(slot: number): void {
  if (socket.connected) {
    socket.emit("saves:delete", { slot });
  }
}

/** Back to the slot picker (off shift only). */
export function leaveSave(): void {
  if (socket.connected) {
    socket.emit("saves:leave");
  }
}
