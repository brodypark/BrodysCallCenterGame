// Browsers block sound until the player clicks something, so the first click or key press
// (Clock In, or anything after a refresh mid-shift) starts the shared audio context. Victim
// voices play through it (VictimVoice).

let context: AudioContext | null = null;

/** Starts (or resumes) the shared audio context. Call it from a click handler. */
export function unlockAudio(): void {
  try {
    context ??= new AudioContext();
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
