// The client's copy of the player's shift: the last snapshot the server sent, how far the
// server's clock is from this one (so countdowns are right even if this clock is off), and
// the latest shift's results until the player closes them.

import { MsPerSecond } from "@shared/time";
import type { ShiftResult, ShiftSnapshot } from "@shared/types";
import { Config } from "@shared/Config";
import { resultSeen } from "@client/net/shiftActions";
import { socket } from "@client/net/socket";
import { createStore, useStore } from "@client/state/createStore";

export interface ShiftState {
  snapshot: ShiftSnapshot;
  // Server time minus this machine's time, in milliseconds.
  clockOffsetMs: number;
  // The results of the shift that just ended, shown until the player closes them.
  result: ShiftResult | null;
}

const shift = createStore<ShiftState>({
  snapshot: {
    status: "offShift",
    earnings: 0,
    quota: Config.Shift.Quota,
    lengthSeconds: Config.Shift.LengthSeconds,
    endsAt: null,
    overtimeEndsAt: null,
    serverNow: Date.now(),
  },
  clockOffsetMs: 0,
  result: null,
});

function onSnapshot(snapshot: ShiftSnapshot): void {
  shift.set({ ...shift.get(), snapshot, clockOffsetMs: snapshot.serverNow - Date.now() });
}

function onEnded(result: ShiftResult): void {
  shift.set({ ...shift.get(), result });
}

socket.on("shift:snapshot", onSnapshot);
socket.on("shift:ended", onEnded);

// When Vite hot-reloads this module in development, remove the old copy's listeners.
import.meta.hot?.dispose(() => {
  socket.off("shift:snapshot", onSnapshot);
  socket.off("shift:ended", onEnded);
});

/** The latest shift state; re-renders the component when it changes. */
export function useShift(): ShiftState {
  return useStore(shift);
}

/** Closes the results screen. */
export function dismissShiftResult(): void {
  shift.set({ ...shift.get(), result: null });
  resultSeen();
}

/** Seconds from now (on the server's clock) until `serverTime`. */
export function secondsUntil(serverTime: number, clockOffsetMs: number): number {
  return (serverTime - (Date.now() + clockOffsetMs)) / MsPerSecond;
}
