// The player's sound settings (ui/audioSettings) for this page, saved in this browser. The
// music, sound effects and victim voice read them; the Settings app changes them.

import { createStore, type Store, useStore } from "@client/state/createStore";
import { type AudioSettings, parseAudioSettings } from "@client/ui/audioSettings";

// The key from when only music had settings, so earlier choices carry over.
const StorageKey = "scamgpt.music";

function load(): AudioSettings {
  try {
    return parseAudioSettings(localStorage.getItem(StorageKey));
  } catch {
    // Storage blocked (e.g. a private window): the defaults, unsaved.
    return parseAudioSettings(null);
  }
}

const settings = createStore<AudioSettings>(load());

/** The settings, and changes to them, for code outside React. */
export const audioSettingsStore: Pick<Store<AudioSettings>, "get" | "subscribe"> = settings;

function clampVolume(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function update(change: Partial<AudioSettings>): void {
  const next = { ...settings.get(), ...change };
  settings.set(next);
  try {
    localStorage.setItem(StorageKey, JSON.stringify(next));
  } catch {
    // Not saved, but it still applies.
  }
}

export function setMasterVolume(volume: number): void {
  update({ masterVolume: clampVolume(volume) });
}

/** Picks a song, or null for no music. */
export function setMusicSong(songId: string | null): void {
  update({ songId });
}

export function setMusicVolume(volume: number): void {
  update({ musicVolume: clampVolume(volume) });
}

export function setEffectsOn(on: boolean): void {
  update({ effectsOn: on });
}

export function setEffectsVolume(volume: number): void {
  update({ effectsVolume: clampVolume(volume) });
}

/** The sound settings; re-renders the component when they change. */
export function useAudioSettings(): AudioSettings {
  return useStore(settings);
}
