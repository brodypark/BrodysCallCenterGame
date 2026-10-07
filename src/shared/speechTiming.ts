// How long a victim line takes to say, worked out from its length. Used by the client to
// fake speaking until real voices arrive (step 9), and by the server's safety timer.

import { Config } from "@shared/Config";

function characters(text: string): number {
  return [...text].length;
}

/** How long saying `text` takes without a voice, so the player has time to read it. */
export function fakeSpeakingSeconds(text: string): number {
  const { SpeakingSecondsPerCharacter, MinSpeakingSeconds, MaxSpeakingSeconds } = Config.Turn;
  const seconds = characters(text) * SpeakingSecondsPerCharacter;
  return Math.min(Math.max(seconds, MinSpeakingSeconds), MaxSpeakingSeconds);
}

/** The longest the server waits for the client to finish saying `text` before moving on. */
export function safetySeconds(text: string): number {
  const { SafetySecondsPerCharacter, SafetyExtraSeconds } = Config.Turn;
  return characters(text) * SafetySecondsPerCharacter + SafetyExtraSeconds;
}
