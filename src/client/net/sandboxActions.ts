// What the player can ask the server to do in Sandbox mode. Intent only: the server ignores
// all of it unless the player is playing their Sandbox save.

import type { SandboxCheat, SandboxSettingsChange } from "@shared/sandbox";
import { socket } from "@client/net/socket";

/** Plays the Sandbox save (from the title menu). */
export function enterSandbox(): void {
  if (socket.connected) {
    socket.emit("sandbox:enter");
  }
}

export function changeSandbox(change: SandboxSettingsChange): void {
  if (socket.connected) {
    socket.emit("sandbox:settings", change);
  }
}

export function ringNow(): void {
  if (socket.connected) {
    socket.emit("sandbox:ringNow");
  }
}

/** Sets the trust bar during a call, 0 to 100. */
export function setTrust(percent: number): void {
  if (socket.connected) {
    socket.emit("sandbox:trust", { percent });
  }
}

export function cheat(which: SandboxCheat): void {
  if (socket.connected) {
    socket.emit("sandbox:cheat", { cheat: which });
  }
}

/** Puts on a wallpaper or theme, bought or not. */
export function wear(id: string): void {
  if (socket.connected) {
    socket.emit("sandbox:wear", { id });
  }
}

export function resetSandbox(): void {
  if (socket.connected) {
    socket.emit("sandbox:reset");
  }
}
