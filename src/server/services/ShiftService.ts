// The player's shift. For now it only holds the money they've earned this session; step 5
// adds the timer, the quota, overtime and the results.

import type { ShiftSnapshot } from "@shared/types";

export interface ShiftServiceOptions {
  // Sends a player their latest shift snapshot. Called after every change.
  send: (playerId: string, snapshot: ShiftSnapshot) => void;
}

export class ShiftService {
  private readonly earnings = new Map<string, number>();
  private readonly send: ShiftServiceOptions["send"];

  constructor(options: ShiftServiceOptions) {
    this.send = options.send;
  }

  snapshot(playerId: string): ShiftSnapshot {
    return { earnings: this.earnings.get(playerId) ?? 0 };
  }

  addEarnings(playerId: string, amount: number): void {
    this.earnings.set(playerId, (this.earnings.get(playerId) ?? 0) + amount);
    this.send(playerId, this.snapshot(playerId));
  }

  removePlayer(playerId: string): void {
    this.earnings.delete(playerId);
  }

  removeAll(): void {
    this.earnings.clear();
  }
}
