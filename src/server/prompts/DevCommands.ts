// Development-only commands, typed as a message during a call, to test levels and the shop
// without playing for hours. CallService only checks them when test words are allowed
// (never in production), and they're never sent to the victim.

import type { PlayerStats } from "@shared/stats";

type DevCommand = (stats: PlayerStats) => void;

/** The change for `message`, or null if it isn't a dev command. */
export function matchDevCommand(_message: string): DevCommand | null {
  return null;
}
