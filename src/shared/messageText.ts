// Cleans up a message the player typed, the same way on the client and the server, so the
// client never sends something the server would quietly throw away.

import { Config } from "@shared/Config";

// A character (code point) takes at most this many UTF-16 units in a JS string.
export const MaxUnitsPerCharacter = 2;

// Control characters, and the Unicode spaces and line breaks that would otherwise show as
// blank lines or fake a new line in a transcript.
const ControlCharacters = /\p{Cc}/gu;
const UnicodeSpaces = /[\u0085\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/gu;
// Half of a surrogate pair on its own: not valid text.
const LoneSurrogate = /\p{Cs}/u;

/**
 * The message with control characters and odd spaces turned into plain spaces and the ends
 * trimmed, or null if it's empty, too long or not valid text.
 */
export function cleanMessage(
  text: string,
  maxLength: number = Config.Call.MaxTypedMessageLength,
): string | null {
  // Cheap checks first, so huge strings are turned away before any pattern work.
  if (text.length > maxLength * MaxUnitsPerCharacter || LoneSurrogate.test(text)) {
    return null;
  }
  if ([...text].length > maxLength) {
    return null;
  }
  const cleaned = text.replace(ControlCharacters, " ").replace(UnicodeSpaces, " ").trim();
  return cleaned === "" ? null : cleaned;
}
