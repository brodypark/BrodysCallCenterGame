// Full screen mode for the whole page (the browser's Fullscreen API). The browser owns the
// state, since the player can also leave with Esc, so this follows its fullscreenchange
// event. Not saved: browsers only go full screen right after a click.

import { useSyncExternalStore } from "react";

/** Whether this browser lets the page go full screen (iPhones don't). */
export function fullscreenSupported(): boolean {
  // Missing entirely on iPhones, so it can be undefined despite its type.
  return document.fullscreenEnabled === true;
}

function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

function subscribe(listener: () => void): () => void {
  document.addEventListener("fullscreenchange", listener);
  return () => document.removeEventListener("fullscreenchange", listener);
}

/** Enters or leaves full screen. Call it from a click; does nothing if it's unsupported. */
export async function setFullscreen(on: boolean): Promise<void> {
  if (!fullscreenSupported() || on === isFullscreen()) {
    return;
  }
  try {
    if (on) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    // Refused (no click first, or blocked by the browser): the page stays as it is.
    console.warn("Full screen change failed.", error);
  }
}

/** Whether the page is full screen; re-renders the component when it changes. */
export function useFullscreen(): boolean {
  return useSyncExternalStore(subscribe, isFullscreen);
}
