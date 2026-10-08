// Each player's save slots: picking one to play, starting a fresh save in an empty one, and
// deleting one. A session plays one slot at a time; until one is picked, nothing starts.
// Refreshing within the reconnect grace period keeps the session (and its slot), so the
// picker only comes back for a new visit, or when the player switches saves off shift.

import { Config } from "@shared/Config";
import type { PlayerStats, SaveSlotSummary, SavesSnapshot } from "@shared/types";
import type { DataService } from "@server/services/DataService";
import { defaultStats, type StatsService } from "@server/services/StatsService";

export interface SaveServiceOptions {
  data: DataService;
  stats: StatsService;
  // True while the player can't switch saves (e.g. on shift).
  isBusy: (playerId: string) => boolean;
  // The player stopped playing a save (e.g. to clear anything left over from it).
  onLeave: (playerId: string) => void;
  send: (playerId: string, snapshot: SavesSnapshot) => void;
}

export class SaveService {
  // The slot each live session is playing.
  private readonly active = new Map<string, number>();
  private readonly options: SaveServiceOptions;

  constructor(options: SaveServiceOptions) {
    this.options = options;
  }

  activeSlot(playerId: string): number | null {
    return this.active.get(playerId) ?? null;
  }

  snapshot(playerId: string): SavesSnapshot {
    const stored = this.options.data.listSlots(playerId, Config.Saves.SlotCount);
    const slots: SaveSlotSummary[] = [...stored].map(([slot, save]) => ({
      slot,
      state: save.state,
      stats: save.state === "ready" ? save.stats : null,
      updatedAt: save.state === "empty" ? null : save.updatedAt,
    }));
    return { slots, activeSlot: this.activeSlot(playerId) };
  }

  /** Plays the save in `slot`. Only when no save is being played, and the slot is ready. */
  continueSlot(playerId: string, slot: number): void {
    if (this.active.has(playerId)) {
      return;
    }
    const save = this.options.data.readSlot(playerId, slot);
    if (save.state !== "ready") {
      return;
    }
    this.start(playerId, slot, save.stats);
  }

  /** Starts a fresh save in an empty `slot` and plays it. */
  newGame(playerId: string, slot: number): void {
    if (this.active.has(playerId) || this.options.data.readSlot(playerId, slot).state !== "empty") {
      return;
    }
    const stats = defaultStats();
    this.options.data.writeSlot(playerId, slot, stats);
    this.start(playerId, slot, stats);
  }

  /** Deletes the save in `slot`. Never the one being played. */
  deleteSlot(playerId: string, slot: number): void {
    if (this.active.get(playerId) === slot) {
      return;
    }
    this.options.data.deleteSlot(playerId, slot);
    this.publish(playerId);
  }

  /** Stops playing the current save and goes back to the picker. Not while busy. */
  leave(playerId: string): void {
    if (!this.active.has(playerId) || this.options.isBusy(playerId)) {
      return;
    }
    this.active.delete(playerId);
    // Saves first, so the client knows no save is picked before the blank stats arrive.
    this.publish(playerId);
    // Back to a blank slate (not saved anywhere), so the picker shows the default look.
    this.options.stats.load(playerId, defaultStats());
    this.options.onLeave(playerId);
  }

  /** Writes the player's stats to the slot they're playing. */
  save(playerId: string, stats: PlayerStats): void {
    const slot = this.active.get(playerId);
    if (slot !== undefined) {
      this.options.data.writeSlot(playerId, slot, stats);
    }
  }

  /** Everyone with a save picked this session. */
  activePlayers(): string[] {
    return [...this.active.keys()];
  }

  /** Ends the player's session (their saves stay in the database). */
  removePlayer(playerId: string): void {
    this.active.delete(playerId);
  }

  removeAll(): void {
    this.active.clear();
  }

  private start(playerId: string, slot: number, stats: PlayerStats): void {
    this.active.set(playerId, slot);
    this.options.stats.load(playerId, stats);
    this.publish(playerId);
  }

  private publish(playerId: string): void {
    this.options.send(playerId, this.snapshot(playerId));
  }
}
