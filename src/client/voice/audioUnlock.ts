// Browsers block sound until the player clicks something, so the first click or key press
// (Clock In, or anything after a refresh mid-shift) starts the shared audio context. Step 9
// plays victim voices through it.

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

/** Unlocks audio on the player's first click or key press anywhere. Returns a function that
 * stops listening (it also stops by itself once it has run). */
export function unlockAudioOnFirstInput(): () => void {
  const events = ["pointerdown", "keydown"] as const;
  const stop = (): void => {
    for (const event of events) {
      window.removeEventListener(event, onInput, true);
    }
  };
  function onInput(): void {
    unlockAudio();
    stop();
  }
  for (const event of events) {
    window.addEventListener(event, onInput, true);
  }
  return stop;
}
