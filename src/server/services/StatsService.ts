// Each player's stats: banked money, XP, calls and shifts. Kept in memory for now; step 6
// saves them in SQLite. Every change sends the player a fresh copy.

import type { PlayerStats } from "@shared/types";

export function defaultStats(): PlayerStats {
  return {
    money: 0,
    xp: 0,
    callsCompleted: 0,
    successfulCalls: 0,
    shiftsPassed: 0,
    shiftsFailed: 0,
  };
}

export interface StatsServiceOptions {
  send: (playerId: string, stats: PlayerStats) => void;
}

export class StatsService {
  private readonly stats = new Map<string, PlayerStats>();
  private readonly send: StatsServiceOptions["send"];

  constructor(options: StatsServiceOptions) {
    this.send = options.send;
  }

  /** A copy of the player's stats (defaults for someone new). */
  get(playerId: string): PlayerStats {
    return { ...(this.stats.get(playerId) ?? defaultStats()) };
  }

  /** Changes the player's stats and sends them the result. */
  update(playerId: string, change: (stats: PlayerStats) => void): void {
    const stats = this.get(playerId);
    change(stats);
    this.stats.set(playerId, stats);
    this.send(playerId, { ...stats });
  }

  removePlayer(playerId: string): void {
    this.stats.delete(playerId);
  }

  removeAll(): void {
    this.stats.clear();
  }
}
