// Every sound effect the game plays and how it plays: how loud, whether it loops, and
// whether it's cut short. Plain data, so the sound makers and their tests don't need a
// browser.

import { Config } from "@shared/Config";

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
  | "level-up"
  | "new-mail";

interface SoundInfo {
  // From 0 to 1, before the player's master and sound effects volumes.
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
  // A steady buzz sounds much louder than a ringing bell at the same level.
  "wrong-code": { volume: 0.2 },
  "suspicion-up": { volume: 0.4 },
  "suspicion-down": { volume: 0.4 },
  "clock-in": { volume: 0.6 },
  overtime: { volume: 0.25, maxSeconds: Config.Sounds.OvertimeSeconds },
  stamp: { volume: 0.8 },
  promoted: { volume: 0.5 },
  fired: { volume: 0.6 },
  "level-up": { volume: 0.5 },
  "new-mail": { volume: 0.5 },
};
