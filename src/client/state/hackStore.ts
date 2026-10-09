// The hacked screen: set when the server says the player cashed in a bait caller's trap code,
// and cleared once its seconds are up. null while the screen is fine.

import { MsPerSecond, secondsToMs } from "@shared/time";
import type { HackInfo } from "@shared/types";
import { socket } from "@client/net/socket";
import { createStore, useStore } from "@client/state/createStore";

export interface HackState {
  // How long it lasts, and when it started (this machine's Date.now()).
  seconds: number;
  startedAt: number;
  // Taken from the bank.
  fine: number;
  // False in Sandbox, which has no shift.
  shiftFailed: boolean;
}

const hack = createStore<HackState | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

function onHack(info: HackInfo): void {
  if (timer !== null) {
    clearTimeout(timer);
  }
  hack.set({ ...info, startedAt: Date.now() });
  timer = setTimeout(() => {
    timer = null;
    hack.set(null);
  }, secondsToMs(info.seconds));
}

socket.on("hack:triggered", onHack);

// When Vite hot-reloads this module in development, remove the old copy's listener and timer.
import.meta.hot?.dispose(() => {
  socket.off("hack:triggered", onHack);
  if (timer !== null) {
    clearTimeout(timer);
  }
});

/** The hack in progress, or null; re-renders the component when it changes. */
export function useHack(): HackState | null {
  return useStore(hack);
}

/** Whole seconds left on `state`'s hack at `now`, at least 0. */
export function hackSecondsLeft(state: HackState, now: number): number {
  return Math.max(0, Math.ceil(state.seconds - (now - state.startedAt) / MsPerSecond));
}
