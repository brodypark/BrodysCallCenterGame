// Each player's stats for the save they're playing: banked money, XP, calls and shifts.
// SaveService loads them when a slot is picked; every change is sent to the player and
// written to that slot.

import { type PlayerStats, PlayerStatsSchema } from "@shared/stats";

/** A fresh save's stats: every field at its schema default. */
export function defaultStats(): PlayerStats {
  return PlayerStatsSchema.parse({});
}

export interface StatsServiceOptions {
  send: (playerId: string, stats: PlayerStats) => void;
  // Writes the stats to the player's save. Called after every change.
  save: (playerId: string, stats: PlayerStats) => void;
}

export class StatsService {
  private readonly stats = new Map<string, PlayerStats>();
  private readonly options: StatsServiceOptions;

  constructor(options: StatsServiceOptions) {
    this.options = options;
  }

  /** A copy of the player's stats (defaults when no save is loaded). */
  get(playerId: string): PlayerStats {
    return structuredClone(this.stats.get(playerId) ?? defaultStats());
  }

  /** Starts using `stats` (just loaded from a save) for the player. */
  load(playerId: string, stats: PlayerStats): void {
    this.stats.set(playerId, structuredClone(stats));
    this.options.send(playerId, structuredClone(stats));
  }

  /** Changes the player's stats, saves them and sends them the result. */
  update(playerId: string, change: (stats: PlayerStats) => void): void {
    const stats = this.get(playerId);
    change(stats);
    this.stats.set(playerId, stats);
    this.options.save(playerId, structuredClone(stats));
    this.options.send(playerId, structuredClone(stats));
  }

  /** Forgets the player's stats in memory (they're already saved). */
  removePlayer(playerId: string): void {
    this.stats.delete(playerId);
  }

  removeAll(): void {
    this.stats.clear();
  }
}
