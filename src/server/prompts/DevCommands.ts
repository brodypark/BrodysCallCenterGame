// Development-only commands, typed as a message during a call, to test levels and the shop
// without playing for hours. CallService only checks them when test words are allowed
// (never in production), and they're never sent to the victim.

import { levelOf, totalXpFor } from "@shared/Levels";
import type { PlayerStats } from "@shared/stats";

const MoneyGift = 1000;

type DevCommand = (stats: PlayerStats) => void;

const Commands: ReadonlyMap<string, DevCommand> = new Map<string, DevCommand>([
  // Jumps to 1 XP short of the next level, so the next XP earned on a shift levels up (and
  // shows on the shift report). Typing it again goes up a level each time.
  [
    "!xp",
    (stats) => {
      stats.xp = totalXpFor(levelOf(stats.xp + 1) + 1) - 1;
    },
  ],
  [
    "!money",
    (stats) => {
      stats.money += MoneyGift;
    },
  ],
]);

/** The change for `message`, or null if it isn't a dev command. */
export function matchDevCommand(message: string): DevCommand | null {
  return Commands.get(message.trim().toLowerCase()) ?? null;
}
