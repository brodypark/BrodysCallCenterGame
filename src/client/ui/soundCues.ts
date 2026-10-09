// Sounds (and the shake) for call and shift moments that don't belong to one window: the
// phone ringing (with the ringtone the player has on), picking up, the dial tone and shake
// when the victim hangs up, sending a message, clocking in, overtime starting, and new mail. It watches the stores, so they play
// whichever windows are open. Ported from the Roblox UI/SoundCues.

import type { RingtoneId } from "@shared/cosmetics";
import type { CallStatus, ShiftStatus } from "@shared/types";
import { callStore } from "@client/state/callStore";
import { connectionStore } from "@client/state/connectionStore";
import { mailStore, newestId } from "@client/state/mailStore";
import { savesStore } from "@client/state/savesStore";
import { shiftStore } from "@client/state/shiftStore";
import { statsStore } from "@client/state/statsStore";
import { shakeDesktop } from "@client/ui/desktopShake";
import { RingtoneSounds } from "@client/ui/soundList";
import { playSound, stopPreview, stopSound } from "@client/ui/sounds";

// What the last update saw, to tell what changed.
let lastStatus: CallStatus = callStore.get().status;
let lastPlayerTurns = callStore.get().playerTurns;
let lastShift: ShiftStatus = shiftStore.get().snapshot.status;
// The save being played, and the newest email id it had when the inbox last changed. null
// while no save is picked, so switching saves (or reloading) never chimes for old mail.
let lastSlot: number | null = savesStore.get()?.activeSlot ?? null;
let lastNewest: number | null = null;
// Mail that arrived with the shift report up chimes once the report is closed.
let mailWaiting = false;

// The ringtone ringing right now, or null.
let ringingWith: RingtoneId | null = null;

function stopRinging(): void {
  for (const sound of Object.values(RingtoneSounds)) {
    stopSound(sound);
  }
  ringingWith = null;
}

/** Rings with the player's ringtone, unless it's already the one ringing. */
function ring(): void {
  const ringtone = statsStore.get().ringtone;
  if (ringtone === ringingWith) {
    return;
  }
  stopRinging();
  // A Shop preview shouldn't play over the real thing.
  stopPreview();
  ringingWith = ringtone;
  playSound(RingtoneSounds[ringtone]);
}

function onCallChanged(): void {
  const call = callStore.get();
  if (call.status !== lastStatus) {
    if (call.status === "ringing") {
      ring();
    } else {
      stopRinging();
    }
    if (call.status === "inCall" && lastStatus === "ringing") {
      playSound("pick-up");
    } else if (lastStatus === "inCall" && call.lastOutcome === "victimHungUp") {
      playSound("dial-tone");
      shakeDesktop();
    } else if (lastStatus === "inCall" && call.lastOutcome === "victimSaidGoodbye") {
      // The line goes quiet, without the angry shake.
      playSound("dial-tone");
    }
    lastStatus = call.status;
  } else if (call.status === "inCall" && call.playerTurns > lastPlayerTurns) {
    playSound("message-sent");
  }
  lastPlayerTurns = call.playerTurns;
}

// The stats can arrive after the call (on connect), or the ringtone can change mid-ring
// (Sandbox's shop), so a ringing phone switches to the one now on.
function onStatsChanged(): void {
  if (callStore.get().status === "ringing" && connectionStore.get().status === "connected") {
    ring();
  }
}

function onShiftChanged(): void {
  if (mailWaiting && shiftStore.get().result === null) {
    mailWaiting = false;
    playSound("new-mail");
  }
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

// A save's inbox arrives just before the server says it's being played, so the count is
// taken from the inbox already here.
function onSavesChanged(): void {
  const slot = savesStore.get()?.activeSlot ?? null;
  if (slot !== lastSlot) {
    lastSlot = slot;
    lastNewest = slot === null ? null : newestId(mailStore.get());
    mailWaiting = false;
  }
}

function onMailChanged(): void {
  const newest = newestId(mailStore.get());
  if (lastNewest !== null && newest > lastNewest) {
    if (shiftStore.get().result === null) {
      playSound("new-mail");
    } else {
      mailWaiting = true;
    }
  }
  lastNewest = lastSlot === null ? null : newest;
}

// Offline (or replaced by another tab), the call can't be answered here, so stop ringing.
// The next snapshot after reconnecting starts it again if it's still ringing.
function onConnectionChanged(): void {
  if (connectionStore.get().status !== "connected") {
    stopRinging();
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
    statsStore.subscribe(onStatsChanged),
    savesStore.subscribe(onSavesChanged),
    mailStore.subscribe(onMailChanged),
    connectionStore.subscribe(onConnectionChanged),
  ];
}

// When Vite hot-reloads this module in development, stop the old copy.
import.meta.hot?.dispose(() => {
  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  stopRinging();
});
