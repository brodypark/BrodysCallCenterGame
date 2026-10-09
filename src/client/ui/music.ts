// Background music: loops the song the player picked (ui/songs) on one audio element, and
// gets quieter while the victim talks. It tries to start as soon as the page opens; most
// browsers only allow that once the player has clicked or pressed a key (Chrome also allows
// it on sites they've played on before), so it tries again on every input until it's
// playing. The song and volumes come from the player's sound settings
// (ui/audioSettingsStore).

import { Config } from "@shared/Config";
import { MsPerSecond } from "@shared/time";
import { callStore } from "@client/state/callStore";
import { connectionStore } from "@client/state/connectionStore";
import { musicVolume } from "@client/ui/audioSettings";
import { audioSettingsStore as settings } from "@client/ui/audioSettingsStore";
import { introStore } from "@client/ui/introPlayer";
import { findSong } from "@client/ui/songs";

let element: HTMLAudioElement | null = null;
// The volume fade in progress.
let fadeFrame: number | null = null;

function victimTalking(): boolean {
  const call = callStore.get();
  return call.status === "inCall" && call.turn === "victimTurn";
}

/** Eases the element's volume to where it should be. */
function fadeVolume(): void {
  if (element === null) {
    return;
  }
  const audio = element;
  const target = musicVolume(settings.get(), victimTalking());
  if (fadeFrame !== null) {
    cancelAnimationFrame(fadeFrame);
  }
  // Over FadeSeconds, by elapsed time rather than until the volume matches: some browsers
  // (iOS Safari) ignore volume changes, so it might never match.
  const from = audio.volume;
  const start = performance.now();
  const step = (now: number): void => {
    const progress = Math.min(
      Math.max((now - start) / MsPerSecond / Config.Music.FadeSeconds, 0),
      1,
    );
    audio.volume = Math.min(Math.max(from + (target - from) * progress, 0), 1);
    fadeFrame = progress < 1 ? requestAnimationFrame(step) : null;
  };
  fadeFrame = requestAnimationFrame(step);
}

/** Starts, switches or stops the music to match the settings. */
function sync(): void {
  const song = findSong(settings.get().songId);
  // Another tab took over the game, so it plays the music instead. The intro video has its
  // own sound, so the music waits for it.
  if (
    song === undefined ||
    connectionStore.get().status === "replaced" ||
    introStore.get() !== "off"
  ) {
    element?.pause();
    return;
  }
  if (element === null) {
    element = new Audio();
    element.loop = true;
    element.volume = 0;
  }
  const src = new URL(`${import.meta.env.BASE_URL}${song.file}`, window.location.href).href;
  if (element.src !== src) {
    element.src = src;
  }
  if (element.paused) {
    // Refused until the player has clicked; the next input tries again.
    element.play().catch(() => undefined);
  }
  fadeVolume();
}

// pointerup too: on touch screens it's the tap that lets a page play sound.
const InputEvents = ["pointerdown", "pointerup", "keydown"] as const;
let unsubscribers: (() => void)[] = [];

function onInput(): void {
  if (element === null || element.paused) {
    sync();
  }
}

/** Starts the music (on the first input) and ducks it for the victim. Call once at load. */
export function startMusic(): void {
  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  unsubscribers = [
    settings.subscribe(sync),
    introStore.subscribe(sync),
    callStore.subscribe(fadeVolume),
    connectionStore.subscribe(() => {
      if (connectionStore.get().status === "replaced") {
        sync();
      }
    }),
  ];
  for (const event of InputEvents) {
    window.addEventListener(event, onInput, true);
  }
  // Right away, in case the browser allows it without a click.
  sync();
}

// When Vite hot-reloads this module in development, stop the old copy.
import.meta.hot?.dispose(() => {
  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  for (const event of InputEvents) {
    window.removeEventListener(event, onInput, true);
  }
  if (fadeFrame !== null) {
    cancelAnimationFrame(fadeFrame);
  }
  element?.pause();
});
