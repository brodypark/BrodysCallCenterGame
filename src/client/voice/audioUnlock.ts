// Browsers block sound until the player clicks something, so the first click or key press
// (Clock In, or anything after a refresh mid-shift) starts the shared audio context. Victim
// voices play through it (VictimVoice).

let context: AudioContext | null = null;
// Told each time the context starts running (after the first click, or after the browser
// suspended it), e.g. so a phone that started ringing before then can be heard.
const runningListeners = new Set<() => void>();

function onStateChange(): void {
  if (context?.state === "running") {
    for (const listener of runningListeners) {
      listener();
    }
  }
}

/** Calls `listener` whenever the shared audio context starts running. Returns a function
 * that stops it. */
export function onAudioRunning(listener: () => void): () => void {
  runningListeners.add(listener);
  return () => runningListeners.delete(listener);
}

/** Starts (or resumes) the shared audio context. Call it from a click handler. */
export function unlockAudio(): void {
  try {
    if (context === null) {
      context = new AudioContext();
      context.addEventListener("statechange", onStateChange);
      // Some browsers start it running straight away, with no state change to hear.
      onStateChange();
    }
    if (context.state === "suspended") {
      context.resume().catch(() => undefined);
    }
  } catch {
    // No audio on this browser: the game still works with subtitles.
  }
}

/** The shared audio context, once a click has started it. */
export function getAudioContext(): AudioContext | null {
  return context;
}

/** Unlocks audio on every click or key press anywhere, so a context the browser suspended
 * later (e.g. Safari after the tab was in the background) comes back too. Cheap once it's
 * running. Returns a function that stops listening. */
export function keepAudioUnlocked(): () => void {
  // pointerup too: on touch screens it's the tap that lets a page play sound.
  const events = ["pointerdown", "pointerup", "keydown"] as const;
  for (const event of events) {
    window.addEventListener(event, unlockAudio, true);
  }
  return () => {
    for (const event of events) {
      window.removeEventListener(event, unlockAudio, true);
    }
  };
}
