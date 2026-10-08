// Small rules for push-to-talk that don't need a browser: what each speech recognition
// error means for the player, how a long transcript is shortened, and which elements take
// typing (so holding V there types a "v" instead of talking).

export interface SpeechFailure {
  // What the player is told, or null to say nothing (e.g. we stopped it ourselves).
  notice: string | null;
  // True if talking can't work on this page, so the game sticks to typing from now on.
  permanent: boolean;
}

export const UnsupportedNotice = "Voice doesn't work in this browser. Type instead.";
export const NothingHeardNotice = "Didn't catch that. Try again, or type it.";

// What each of the browser's speech recognition error codes (lib.dom's
// SpeechRecognitionErrorCode) means. Codes not listed get OtherFailure.
const Failures: Partial<Record<string, SpeechFailure>> = {
  // We stopped it ourselves.
  aborted: { notice: null, permanent: false },
  "no-speech": { notice: NothingHeardNotice, permanent: false },
  "not-allowed": { notice: "Mic blocked. Type your messages instead.", permanent: true },
  // Safari says this when dictation (Siri) is switched off.
  "service-not-allowed": {
    notice: "Voice is switched off in this browser. Type instead.",
    permanent: true,
  },
  "audio-capture": { notice: "No mic found. Type your messages instead.", permanent: true },
  "language-not-supported": { notice: UnsupportedNotice, permanent: true },
  // Also what browsers that block the speech service (e.g. Brave) say.
  network: { notice: "Couldn't reach the speech service. Type instead.", permanent: false },
};

const OtherFailure: SpeechFailure = {
  notice: "Voice didn't work that time. Type instead.",
  permanent: false,
};

/** What a speech recognition error means for the player. */
export function speechFailure(code: string): SpeechFailure {
  return Object.hasOwn(Failures, code) ? (Failures[code] ?? OtherFailure) : OtherFailure;
}

/**
 * The transcript cut to at most `maxLength` characters, at the last word break that keeps
 * at least half of it, so a long ramble still sends instead of being thrown away.
 */
export function shortenTranscript(text: string, maxLength: number): string {
  const characters = [...text.trim()];
  if (characters.length <= maxLength) {
    return characters.join("");
  }
  const cut = characters.slice(0, maxLength).join("");
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace >= cut.length / 2 ? cut.slice(0, lastSpace) : cut).trim();
}

/** The bits of an element that say whether it takes typing. */
export interface FocusTarget {
  tagName: string;
  isContentEditable: boolean;
}

const TypingTags = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** True if keys pressed here type text, so the talk key shouldn't talk. */
export function takesTyping(element: FocusTarget | null): boolean {
  return element !== null && (element.isContentEditable || TypingTags.has(element.tagName));
}
