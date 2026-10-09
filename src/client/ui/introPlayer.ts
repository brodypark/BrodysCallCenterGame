// The intro video: plays when the player starts a new Campaign save (New Game), then fades
// into the desk. It starts inside the New Game click, so the browser lets it play with sound
// (Safari only allows that from the click itself). The player can skip it with the button in
// the corner, which goes away once the video has ended. While it's on, the music waits, and
// How to Play and the boss's welcome email wait for the desk (ui/IntroVideo shows it).
//
// It plays on one video element, made on first use and moved into the IntroVideo window
// while it shows. A video that can't load or play goes straight to the desk; a refresh
// mid-video doesn't replay it.

import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import { connectionStore } from "@client/state/connectionStore";
import { createStore, useStore } from "@client/state/createStore";
import { videoVolume } from "@client/ui/audioSettings";
import { audioSettingsStore } from "@client/ui/audioSettingsStore";

// playing: the video is on, with the skip button. fading: it's over (or skipped) and fading
// into the desk.
export type IntroState = "off" | "playing" | "fading";

// Under public/.
const IntroFile = "videos/intro.mp4";

const state = createStore<IntroState>("off");

/** The intro's state, and changes to it, for code outside React (e.g. the music). */
export const introStore: Pick<typeof state, "get" | "subscribe"> = state;

let video: HTMLVideoElement | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;
// True when the browser refused the intro's sound, so it plays muted whatever the volume.
let soundRefused = false;

function videoElement(): HTMLVideoElement {
  if (video === null) {
    video = document.createElement("video");
    // iPhones would otherwise take it fullscreen in their own player.
    video.playsInline = true;
    // Picture-in-picture would take it out of the game.
    video.disablePictureInPicture = true;
    video.preload = "auto";
    video.onended = fadeOut;
    video.onerror = finish;
  }
  return video;
}

/** The video element, once the intro has been played, for IntroVideo to show. */
export function introVideoElement(): HTMLVideoElement | null {
  return video;
}

/** Starts the intro. Call it from the New Game click itself, so it can play with sound. */
export function playIntro(): void {
  if (state.get() !== "off") {
    return;
  }
  const element = videoElement();
  element.src = new URL(`${import.meta.env.BASE_URL}${IntroFile}`, window.location.href).href;
  soundRefused = false;
  applyVolume();
  state.set("playing");
  // A refusal after the player skipped (the skip's pause cancels play()) is ignored.
  element.play().catch(() => {
    if (state.get() !== "playing") {
      return;
    }
    // Sound isn't allowed: play it silently instead, or skip it if even that's refused.
    soundRefused = true;
    applyVolume();
    element.play().catch(() => {
      if (state.get() === "playing") {
        finish();
      }
    });
  });
}

/** Skips the rest: the video stops where it is and fades into the desk. */
export function skipIntro(): void {
  if (state.get() === "playing") {
    video?.pause();
    fadeOut();
  }
}

/** The video is over: the skip button goes, and it fades into the desk. */
function fadeOut(): void {
  if (state.get() !== "playing") {
    return;
  }
  state.set("fading");
  fadeTimer = setTimeout(finish, secondsToMs(Config.Intro.FadeSeconds));
}

/** Takes the intro away and lets go of the video. */
function finish(): void {
  if (fadeTimer !== null) {
    clearTimeout(fadeTimer);
    fadeTimer = null;
  }
  if (state.get() === "off") {
    return;
  }
  if (video !== null) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  state.set("off");
}

function applyVolume(): void {
  if (video === null) {
    return;
  }
  const volume = videoVolume(audioSettingsStore.get());
  video.volume = volume;
  // iPhones ignore a volume set from code, so silence has to be a mute.
  video.muted = soundRefused || volume === 0;
}

function stopIfReplaced(): void {
  // Another tab took over the game: this one goes quiet.
  if (connectionStore.get().status === "replaced") {
    finish();
  }
}

let unsubscribers: (() => void)[] = [];

/** Keeps the intro's volume in step with Settings. Call once when the page loads. */
export function startIntroVideo(): void {
  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  unsubscribers = [
    audioSettingsStore.subscribe(applyVolume),
    connectionStore.subscribe(stopIfReplaced),
  ];
}

// When Vite hot-reloads this module in development, stop the old copy.
import.meta.hot?.dispose(() => {
  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  finish();
});

/** The intro's state; re-renders the component when it changes. */
export function useIntro(): IntroState {
  return useStore(state);
}

/** True while the intro covers the desk (playing or fading out). */
export function useIntroShown(): boolean {
  return useStore(state) !== "off";
}
