// What the player can ask the server to do with a call. Intent only: the server checks each
// one against the call's state and ignores it if it doesn't fit. Nothing is sent while
// disconnected: Socket.IO would otherwise queue it and send it on reconnect, when the call
// may have moved on (e.g. declining the next call instead).

import { socket } from "@client/net/socket";

export function answerCall(): void {
  if (socket.connected) {
    socket.emit("call:answer");
  }
}

export function declineCall(): void {
  if (socket.connected) {
    socket.emit("call:decline");
  }
}

export function hangUp(): void {
  if (socket.connected) {
    socket.emit("call:hangUp");
  }
}

/** The server cleans the text the same way (cleanMessage) and checks it's a call. */
export function sendMessage(text: string): void {
  if (socket.connected) {
    socket.emit("call:send", { text });
  }
}

/** Tells the server the victim's line `lineId` has been said. Returns whether it was sent. */
export function finishedSpeaking(lineId: number): boolean {
  if (!socket.connected) {
    return false;
  }
  socket.emit("call:finishedSpeaking", { lineId });
  return true;
}
