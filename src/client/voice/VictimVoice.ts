// Says the victim's lines, and tells the server when each one has been said so the turn
// can move on. Each line's audio is fetched once from the server (which voices it with
// ElevenLabs) and played on one page-wide audio element, so it plays whether or not the
// Call window is open. The victim's turn only ends when the audio really finishes.
//
// Each line's loudness is measured from its audio once it's downloaded (voice/loudness), so
// the face's mouth follows the words, muted or not.
//
// If there's no audio (voice switched off, over a limit, a failure, or the browser won't
// play it yet), the line is subtitles only and "takes" as long as reading it would
// (fakeSpeakingSeconds). The moment the turn moves on (hanging up, the server's safety
// timer), the audio stops, so it never plays over the player's turn or replays. The server
// has its own safety timer in case this never reports back.

import { ApiRoutes } from "@shared/api";
import { Config } from "@shared/Config";
import { fakeSpeakingSeconds } from "@shared/speechTiming";
import { MsPerSecond, secondsToMs } from "@shared/time";
import { finishedSpeaking } from "@client/net/callActions";
import { socket } from "@client/net/socket";
import { callStore } from "@client/state/callStore";
import { createStore, useStore } from "@client/state/createStore";
import { getAudioContext } from "@client/voice/audioUnlock";
import { type LoudnessEnvelope, loudnessAt, loudnessEnvelope } from "@client/voice/loudness";
import { currentVictimLine, type VictimLine } from "@client/voice/victimLine";

interface Speaking {
  line: VictimLine;
  startedAt: number;
  // Cancels the audio download.
  download: AbortController;
  // The load timeout, or the timer for a line without audio.
  timer: ReturnType<typeof setTimeout> | null;
  // The downloaded audio, while it's playing.
  audioUrl: string | null;
  // True once the line has fallen back to subtitles only.
  subtitles: boolean;
  // How loud the line is at each moment, once measured; "failed" if it couldn't be.
  loudness: LoudnessEnvelope | "pending" | "failed";
}

// The line being said right now.
let speaking: Speaking | null = null;
// The line the server has been told is done, so it isn't reported twice. Line ids start
// over when the server forgets a player (a restart, or a long disconnect), so this is
// forgotten between lines and on every new connection rather than compared as a number.
let reportedLineId: number | null = null;

// The one audio element every line plays on, made on first use.
let player: HTMLAudioElement | null = null;

const muted = createStore(false);

function audioElement(): HTMLAudioElement {
  player ??= new Audio();
  return player;
}

/** True once the player has clicked or pressed a key on the page, so the browser lets it
 * play sound. Older browsers without userActivation count the click that started the
 * shared audio context. */
function canPlayAloud(): boolean {
  const activation = (navigator as Partial<Navigator>).userActivation;
  return activation ? activation.hasBeenActive : getAudioContext() !== null;
}

function applyMute(): void {
  if (player) {
    player.muted = muted.get();
  }
}

/** Measures how loud `current`'s line is at each moment, for the face's mouth. Decoding
 * needs no click, so it uses an offline context. */
async function measureLoudness(current: Speaking, audio: Blob): Promise<void> {
  try {
    const { LoudnessFramesPerSecond, LoudnessPeakShare, LoudnessGate } = Config.Face;
    const decoded = await new OfflineAudioContext(1, 1, DecodeSampleRate).decodeAudioData(
      await audio.arrayBuffer(),
    );
    current.loudness = loudnessEnvelope(decoded.getChannelData(0), decoded.sampleRate, {
      framesPerSecond: LoudnessFramesPerSecond,
      peakShare: LoudnessPeakShare,
      gate: LoudnessGate,
    });
  } catch {
    // The mouth just flaps for this line.
    current.loudness = "failed";
  }
}

// Any rate will do for an offline context that only decodes; the audio keeps its own.
const DecodeSampleRate = 44_100;

/** Stops the audio and forgets it, so the element can never replay it. */
function releaseAudio(current: Speaking): void {
  if (player) {
    player.onended = null;
    player.onerror = null;
    player.pause();
    player.removeAttribute("src");
    player.load();
  }
  if (current.audioUrl !== null) {
    URL.revokeObjectURL(current.audioUrl);
    current.audioUrl = null;
  }
}

function clearTimer(current: Speaking): void {
  if (current.timer !== null) {
    clearTimeout(current.timer);
    current.timer = null;
  }
}

function stopSpeaking(): void {
  const current = speaking;
  if (current === null) {
    return;
  }
  speaking = null;
  current.download.abort();
  clearTimer(current);
  releaseAudio(current);
}

/** The line has been said: tells the server, which moves the turn on. */
function finish(current: Speaking): void {
  if (speaking !== current) {
    return;
  }
  stopSpeaking();
  const { lineId } = current.line;
  // If it couldn't be sent (offline), the next snapshot after reconnecting tries again.
  if (finishedSpeaking(lineId)) {
    reportedLineId = lineId;
  }
}

/** No audio for this line: it takes as long as reading it would, counted from when it
 * started. */
function subtitlesOnly(current: Speaking): void {
  if (speaking !== current) {
    return;
  }
  current.subtitles = true;
  current.download.abort();
  clearTimer(current);
  releaseAudio(current);
  const elapsedSeconds = (Date.now() - current.startedAt) / MsPerSecond;
  const remaining = Math.max(0, fakeSpeakingSeconds(current.line.text) - elapsedSeconds);
  current.timer = setTimeout(() => finish(current), secondsToMs(remaining));
}

async function playLine(current: Speaking): Promise<void> {
  try {
    const response = await fetch(`${ApiRoutes.VictimVoice}/${current.line.lineId}`, {
      signal: current.download.signal,
    });
    if (!response.ok) {
      throw new Error(`No voice for this line (${response.status}).`);
    }
    const audio = await response.blob();
    if (speaking !== current) {
      return;
    }
    clearTimer(current);
    current.audioUrl = URL.createObjectURL(audio);
    void measureLoudness(current, audio);
    const element = audioElement();
    applyMute();
    element.onended = () => finish(current);
    element.onerror = () => subtitlesOnly(current);
    element.src = current.audioUrl;
    await element.play();
    // In case the browser never says it ended: move on a moment after it should have.
    const remainingSeconds = element.duration - element.currentTime;
    if (speaking === current && Number.isFinite(remainingSeconds)) {
      current.timer = setTimeout(
        () => finish(current),
        secondsToMs(Math.max(0, remainingSeconds) + Config.Voice.EndGraceSeconds),
      );
    }
  } catch {
    // Includes play() refusing because nothing has been clicked yet, and the download being
    // cancelled (then this line is already over, and subtitlesOnly does nothing).
    subtitlesOnly(current);
  }
}

function startLine(line: VictimLine): void {
  const current: Speaking = {
    line,
    startedAt: Date.now(),
    download: new AbortController(),
    timer: null,
    audioUrl: null,
    subtitles: false,
    loudness: "pending",
  };
  speaking = current;
  // Nothing is fetched (or paid for) that couldn't be heard: before the first click after a
  // refresh.
  if (Config.Voice.TypedOnly || !canPlayAloud()) {
    subtitlesOnly(current);
    return;
  }
  current.timer = setTimeout(
    () => subtitlesOnly(current),
    secondsToMs(Config.Voice.LoadTimeoutSeconds),
  );
  void playLine(current);
}

function onCallChanged(): void {
  const line = currentVictimLine(callStore.get());
  if (!line) {
    // The call ended, or the turn moved on.
    stopSpeaking();
    reportedLineId = null;
    return;
  }
  if (speaking?.line.lineId === line.lineId || reportedLineId === line.lineId) {
    return;
  }
  stopSpeaking();
  startLine(line);
}

function onConnect(): void {
  // A report sent just before a disconnect may have been lost; the server ignores repeats.
  // The line starts again when the next snapshot arrives; its audio was already fetched,
  // so it's subtitles only this time.
  stopSpeaking();
  reportedLineId = null;
}

let unsubscribe: (() => void) | null = null;

/** Starts saying victim lines as they arrive. Call once when the page loads. */
export function startVictimVoice(): void {
  unsubscribe?.();
  unsubscribe = callStore.subscribe(onCallChanged);
  socket.off("connect", onConnect);
  socket.on("connect", onConnect);
  onCallChanged();
}

// When Vite hot-reloads this module in development, stop the old copy.
import.meta.hot?.dispose(() => {
  unsubscribe?.();
  socket.off("connect", onConnect);
  stopSpeaking();
});

/** Mutes or unmutes the victim. Their lines still take as long to say. */
export function setVictimMuted(value: boolean): void {
  muted.set(value);
  applyMute();
}

/** Whether the victim is muted; re-renders the component when it changes. */
export function useVictimMuted(): boolean {
  return useStore(muted);
}

/** How loud the victim is right now, from 0 (mouth shut) to 1 (wide open), for the face:
 * 0 when they aren't saying anything (or their audio is still loading), and null while
 * they're saying a line whose loudness isn't known (subtitles only, or it couldn't be
 * measured), so the mouth just flaps. */
export function victimLoudness(): number | null {
  if (speaking === null) {
    return 0;
  }
  if (speaking.subtitles || speaking.loudness === "failed") {
    return null;
  }
  if (speaking.audioUrl === null || speaking.loudness === "pending" || player === null) {
    return 0;
  }
  return loudnessAt(speaking.loudness, player.currentTime);
}
