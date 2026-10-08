// The facecam's settings, saved in this browser (a preference, not game state): whether the
// camera has a stinky aroma. Whether the camera is on is never saved: it starts off every
// time.

import { createStore, useStore } from "@client/state/createStore";

const StinkyKey = "scamgpt.facecamStinky";

function load(): boolean {
  try {
    // On unless the player turned it off.
    return localStorage.getItem(StinkyKey) !== "false";
  } catch {
    // Storage blocked (e.g. a private window): on, unsaved.
    return true;
  }
}

const stinky = createStore<boolean>(load());

export function setStinky(on: boolean): void {
  stinky.set(on);
  try {
    localStorage.setItem(StinkyKey, String(on));
  } catch {
    // Not saved, but it still applies.
  }
}

/** Whether the camera stinks; re-renders the component when it changes. */
export function useStinky(): boolean {
  return useStore(stinky);
}
