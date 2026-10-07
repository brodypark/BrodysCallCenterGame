// Keeps track of which connection belongs to each player. A player has at most one active
// connection: when they open the game in a new tab, it takes over and the old one is told
// why. When their connection drops (or they refresh), their game waits a grace period for
// them to come back before everything about them is cleared.

import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";

export interface PlayerSocket {
  readonly id: string;
}

export interface PlayerServiceOptions<TSocket extends PlayerSocket> {
  // Tells an old connection another tab took over, and disconnects it.
  onReplaced: (socket: TSocket) => void;
  // The grace period ran out: forget everything about this player.
  onPlayerGone: (playerId: string) => void;
  graceSeconds?: number;
}

export class PlayerService<TSocket extends PlayerSocket> {
  private readonly sockets = new Map<string, TSocket>();
  private readonly graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly options: PlayerServiceOptions<TSocket>;

  constructor(options: PlayerServiceOptions<TSocket>) {
    this.options = options;
  }

  /** A connection for `playerId` opened. It becomes their only active one. */
  connect(playerId: string, socket: TSocket): void {
    this.cancelGrace(playerId);
    const previous = this.sockets.get(playerId);
    this.sockets.set(playerId, socket);
    if (previous && previous.id !== socket.id) {
      this.options.onReplaced(previous);
    }
  }

  /** A connection closed. Only the active one starts the grace period. */
  disconnect(playerId: string, socket: TSocket): void {
    if (this.sockets.get(playerId)?.id !== socket.id) {
      // An old tab that was already replaced.
      return;
    }
    this.sockets.delete(playerId);
    const graceSeconds = this.options.graceSeconds ?? Config.Call.ReconnectGraceSeconds;
    this.graceTimers.set(
      playerId,
      setTimeout(() => {
        this.graceTimers.delete(playerId);
        this.options.onPlayerGone(playerId);
      }, secondsToMs(graceSeconds)),
    );
  }

  /** The player's active connection, if they have one. */
  activeSocket(playerId: string): TSocket | undefined {
    return this.sockets.get(playerId);
  }

  /** Cancels every pending grace period, e.g. when the server shuts down. */
  shutdown(): void {
    for (const timer of this.graceTimers.values()) {
      clearTimeout(timer);
    }
    this.graceTimers.clear();
    this.sockets.clear();
  }

  private cancelGrace(playerId: string): void {
    const timer = this.graceTimers.get(playerId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.graceTimers.delete(playerId);
    }
  }
}
