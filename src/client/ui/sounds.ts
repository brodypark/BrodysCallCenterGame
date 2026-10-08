// The game's sound effects. Each is an optional file, public/sounds/<name>.mp3, loaded the
// first time it's played and kept decoded; a missing or broken file is skipped from then on.
// Sounds play through the shared audio context, so nothing plays before the player's first
// click (browsers block it) or while the browser has audio suspended. Playing a sound that's
// already playing starts it again from the beginning.

import { Config } from "@shared/Config";
import { getAudioContext } from "@client/voice/audioUnlock";

export type SoundName =
  | "click"
  | "window-open"
  | "window-close"
  | "ring"
  | "pick-up"
  | "dial-tone"
  | "message-sent"
  | "ka-ching"
  | "coins"
  | "wrong-code"
  | "suspicion-up"
  | "suspicion-down"
  | "clock-in"
  | "overtime"
  | "stamp"
  | "promoted"
  | "fired"
  | "level-up";

interface SoundInfo {
  // From 0 to 1, before Config.Sounds.MasterVolume.
  volume: number;
  // Plays until stopSound.
  loop?: boolean;
  // Cut off after this many seconds.
  maxSeconds?: number;
}

/** Every sound and how it plays. Volumes are the Roblox version's. */
export const Sounds: Record<SoundName, SoundInfo> = {
  click: { volume: 0.4 },
  "window-open": { volume: 0.3 },
  "window-close": { volume: 0.3 },
  ring: { volume: 0.6, loop: true },
  "pick-up": { volume: 0.6 },
  "dial-tone": { volume: 0.4, maxSeconds: Config.Sounds.DialToneSeconds },
  "message-sent": { volume: 0.5 },
  "ka-ching": { volume: 0.7 },
  coins: { volume: 0.5 },
  "wrong-code": { volume: 0.5 },
  "suspicion-up": { volume: 0.4 },
  "suspicion-down": { volume: 0.4 },
  "clock-in": { volume: 0.6 },
  overtime: { volume: 0.4, maxSeconds: Config.Sounds.OvertimeSeconds },
  stamp: { volume: 0.8 },
  promoted: { volume: 0.5 },
  fired: { volume: 0.6 },
  "level-up": { volume: 0.5 },
};

/** Where a sound's file is served from. */
export function soundUrl(name: SoundName): string {
  return `${import.meta.env.BASE_URL}sounds/${name}.mp3`;
}

// Each sound's decoded audio once asked for: null if the file is missing or won't decode.
// A failed download (e.g. briefly offline) isn't kept, so it's tried again next time.
const loaded = new Map<SoundName, Promise<AudioBuffer | null>>();
// The instance of each sound playing right now, so playing it again restarts it.
const playing = new Map<SoundName, AudioBufferSourceNode>();
// Looping sounds that should be playing, so one that loads after stopSound stays quiet.
const wanted = new Set<SoundName>();

async function decode(context: AudioContext, name: SoundName): Promise<AudioBuffer | null> {
  let data: ArrayBuffer;
  try {
    const response = await fetch(soundUrl(name));
    if (!response.ok) {
      return null;
    }
    data = await response.arrayBuffer();
  } catch {
    loaded.delete(name);
    return null;
  }
  try {
    // In development a missing file comes back as the page itself, which won't decode.
    return await context.decodeAudioData(data);
  } catch {
    return null;
  }
}

function load(context: AudioContext, name: SoundName): Promise<AudioBuffer | null> {
  let buffer = loaded.get(name);
  if (buffer === undefined) {
    buffer = decode(context, name);
    loaded.set(name, buffer);
  }
  return buffer;
}

function stopInstance(name: SoundName): void {
  const source = playing.get(name);
  if (source) {
    playing.delete(name);
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
  }
}

/** Plays a sound, if its file exists and the browser allows sound yet. */
export function playSound(name: SoundName): void {
  const context = getAudioContext();
  if (context?.state !== "running") {
    return;
  }
  const info = Sounds[name];
  if (info.loop) {
    wanted.add(name);
  }
  void load(context, name).then((buffer) => {
    if (buffer === null || (info.loop && !wanted.has(name))) {
      return;
    }
    stopInstance(name);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = info.loop === true;
    const gain = context.createGain();
    gain.gain.value = info.volume * Config.Sounds.MasterVolume;
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = () => {
      if (playing.get(name) === source) {
        playing.delete(name);
      }
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    if (info.maxSeconds !== undefined) {
      source.stop(context.currentTime + info.maxSeconds);
    }
    playing.set(name, source);
  });
}

/** Stops a sound (e.g. the ringing once the call is answered). */
export function stopSound(name: SoundName): void {
  wanted.delete(name);
  stopInstance(name);
}
