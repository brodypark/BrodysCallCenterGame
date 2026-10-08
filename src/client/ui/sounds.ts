// The game's sound effects. Each is made in code (ui/synthSounds) the first time it's
// played and kept, unless it's listed in SoundFiles: then public/sounds/<name>.mp3 is used
// instead (falling back to the made one if the file won't load). Sounds play through the
// shared audio context, so nothing plays before the player's first click (browsers block
// it) or while the browser has audio suspended. Playing a sound that's already playing
// starts it again from the beginning. How loud they are (and whether they play at all)
// follows the player's sound settings, even for a sound that's already playing.

import { effectsVolume } from "@client/ui/audioSettings";
import { audioSettingsStore } from "@client/ui/audioSettingsStore";
import { type SoundName, Sounds } from "@client/ui/soundList";
import { synthesize } from "@client/ui/synthSounds";
import { getAudioContext, onAudioRunning } from "@client/voice/audioUnlock";

// Sounds replaced by a recorded file in public/sounds/<name>.mp3 (credit each in
// docs/credits.md). Everything else is made in code.
const SoundFiles: ReadonlySet<SoundName> = new Set<SoundName>([]);

/** Where a sound's file is served from. */
export function soundUrl(name: SoundName): string {
  return `${import.meta.env.BASE_URL}sounds/${name}.mp3`;
}

// Each sound's audio once asked for.
const loaded = new Map<SoundName, Promise<AudioBuffer>>();
// The instance of each sound playing right now, so playing it again restarts it.
const playing = new Map<SoundName, AudioBufferSourceNode>();
// Looping sounds that should be playing, so one that loads after stopSound stays quiet.
const wanted = new Set<SoundName>();

/** `name` made in code, as audio. */
function synthesized(context: AudioContext, name: SoundName): AudioBuffer {
  const samples = synthesize(name, context.sampleRate);
  const buffer = context.createBuffer(1, Math.max(samples.length, 1), context.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

/** `name`'s recorded file, or the made one if it won't load. */
async function fromFile(context: AudioContext, name: SoundName): Promise<AudioBuffer> {
  try {
    const response = await fetch(soundUrl(name));
    if (!response.ok) {
      throw new Error(`No file for ${name} (${response.status}).`);
    }
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch {
    return synthesized(context, name);
  }
}

function load(context: AudioContext, name: SoundName): Promise<AudioBuffer> {
  let buffer = loaded.get(name);
  if (buffer === undefined) {
    buffer = SoundFiles.has(name)
      ? fromFile(context, name)
      : Promise.resolve(synthesized(context, name));
    loaded.set(name, buffer);
  }
  return buffer;
}

// Every sound goes through one volume (the player's sound effects settings) and a limiter,
// so sounds that land together (ka-ching and coins) never crackle. Made once per context.
let output: { context: AudioContext; volume: GainNode } | null = null;
// How quickly volume changes ease in (seconds), so dragging a slider doesn't crackle.
const VolumeEaseSeconds = 0.015;

function outputFor(context: AudioContext): GainNode {
  if (output?.context !== context) {
    const volume = context.createGain();
    volume.gain.value = effectsVolume(audioSettingsStore.get());
    const limiter = context.createDynamicsCompressor();
    volume.connect(limiter);
    limiter.connect(context.destination);
    output = { context, volume };
  }
  return output.volume;
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

/** Plays a sound, if the browser allows sound yet. A one-off sound is skipped while sound
 * effects are off or audio isn't unlocked. A looping one (the ringing) is remembered: it
 * starts as soon as audio unlocks, and runs silently while effects are off, so turning them
 * on mid-ring brings it in. */
export function playSound(name: SoundName): void {
  const context = getAudioContext();
  const info = Sounds[name];
  if (info.loop) {
    wanted.add(name);
  }
  if (
    context?.state !== "running" ||
    (!info.loop && effectsVolume(audioSettingsStore.get()) === 0)
  ) {
    return;
  }
  void load(context, name).then((buffer) => {
    if (info.loop && !wanted.has(name)) {
      return;
    }
    stopInstance(name);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = info.loop === true;
    const gain = context.createGain();
    gain.gain.value = info.volume;
    source.connect(gain);
    gain.connect(outputFor(context));
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

// Settings changes (a slider moving, effects switched off) reach sounds already playing.
const unsubscribeSettings = audioSettingsStore.subscribe(() => {
  if (output) {
    output.volume.gain.setTargetAtTime(
      effectsVolume(audioSettingsStore.get()),
      output.context.currentTime,
      VolumeEaseSeconds,
    );
  }
});

// Looping sounds asked for before audio was unlocked (the phone ringing after a refresh,
// before any click) start once it is.
const unsubscribeRunning = onAudioRunning(() => {
  for (const name of wanted) {
    if (!playing.has(name)) {
      playSound(name);
    }
  }
});

// When Vite hot-reloads this module in development, stop the old copy.
import.meta.hot?.dispose(() => {
  unsubscribeSettings();
  unsubscribeRunning();
  for (const name of [...playing.keys()]) {
    stopSound(name);
  }
});
