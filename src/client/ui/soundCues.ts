// Sounds (and the shake) for call and shift moments that don't belong to one window: the
// phone ringing, picking up, the dial tone and shake when the victim hangs up, sending a
// message, clocking in and overtime starting. It watches the stores, so they play whichever
// windows are open. Ported from the Roblox UI/SoundCues.

import type { CallStatus, ShiftStatus } from "@shared/types";
import { callStore } from "@client/state/callStore";
import { connectionStore } from "@client/state/connectionStore";
import { shiftStore } from "@client/state/shiftStore";
import { shakeDesktop } from "@client/ui/desktopShake";
import { playSound, stopSound } from "@client/ui/sounds";

// What the last update saw, to tell what changed.
let lastStatus: CallStatus = callStore.get().status;
let lastPlayerTurns = callStore.get().playerTurns;
let lastShift: ShiftStatus = shiftStore.get().snapshot.status;

function onCallChanged(): void {
  const call = callStore.get();
  if (call.status !== lastStatus) {
    if (call.status === "ringing") {
      playSound("ring");
    } else {
      stopSound("ring");
    }
    if (call.status === "inCall" && lastStatus === "ringing") {
      playSound("pick-up");
    } else if (lastStatus === "inCall" && call.lastOutcome === "victimHungUp") {
      playSound("dial-tone");
      shakeDesktop();
    }
    lastStatus = call.status;
  } else if (call.status === "inCall" && call.playerTurns > lastPlayerTurns) {
    playSound("message-sent");
  }
  lastPlayerTurns = call.playerTurns;
}

function onShiftChanged(): void {
  const { status } = shiftStore.get().snapshot;
  if (status !== lastShift) {
    if (status === "onShift" && lastShift === "offShift") {
      playSound("clock-in");
    } else if (status === "overtime") {
      playSound("overtime");
    }
    lastShift = status;
  }
}

// Offline (or replaced by another tab), the call can't be answered here, so stop ringing.
// The next snapshot after reconnecting starts it again if it's still ringing.
function onConnectionChanged(): void {
  if (connectionStore.get().status !== "connected") {
    stopSound("ring");
    lastStatus = "idle";
  }
}

let unsubscribers: (() => void)[] = [];

/** Starts playing the cues. Call once when the page loads. */
export function startSoundCues(): void {
  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  unsubscribers = [
    callStore.subscribe(onCallChanged),
    shiftStore.subscribe(onShiftChanged),
    connectionStore.subscribe(onConnectionChanged),
  ];
}

// When Vite hot-reloads this module in development, stop the old copy.
import.meta.hot?.dispose(() => {
  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  stopSound("ring");
});
