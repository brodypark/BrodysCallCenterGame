// The SQLite database holding every player's save slots. better-sqlite3 is synchronous, so
// each call finishes before the next game event runs. Calls that hit a busy file are retried
// with a growing wait; anything else is thrown for the caller to handle.
//
// A slot's stats are stored as JSON and checked with PlayerStatsSchema on the way out. A slot
// that won't parse is reported as damaged and never overwritten, so a bad save can't be
// quietly replaced by a fresh one.

import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { type PlayerStats, PlayerStatsSchema } from "@shared/stats";
import { ServerConfig } from "@server/config";

export type StoredSlot =
  | { state: "empty" }
  | { state: "ready"; stats: PlayerStats; updatedAt: number }
  | { state: "damaged"; updatedAt: number };

interface SlotRow {
  slot: number;
  stats: string;
  updated_at: number;
}

// Schema changes, in order. The database's user_version says how many have run.
const Migrations: readonly string[] = [
  `CREATE TABLE saves (
     player_id TEXT NOT NULL,
     slot INTEGER NOT NULL,
     stats TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (player_id, slot)
   )`,
];

// Includes the extended codes, e.g. SQLITE_BUSY_SNAPSHOT.
function isBusy(error: unknown): boolean {
  if (!(error instanceof Error && "code" in error)) {
    return false;
  }
  const code = String(error.code);
  return code.startsWith("SQLITE_BUSY") || code.startsWith("SQLITE_LOCKED");
}

/** Waits without returning to the event loop. Only used between retries of a busy call. */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function parseStats(json: string): PlayerStats | null {
  try {
    const parsed = PlayerStatsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class DataService {
  private readonly db: Database.Database;

  /** Opens (or creates) the database at `file`. Use ":memory:" for tests. */
  constructor(file: string) {
    if (file !== ":memory:") {
      mkdirSync(path.dirname(file), { recursive: true });
    }
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma(`busy_timeout = ${ServerConfig.Database.BusyTimeoutMs}`);
    this.migrate();
  }

  /** Every slot for the player, 1 to `slotCount`. */
  listSlots(playerId: string, slotCount: number): Map<number, StoredSlot> {
    const rows = this.withRetries(() =>
      this.db
        .prepare<[string], SlotRow>("SELECT slot, stats, updated_at FROM saves WHERE player_id = ?")
        .all(playerId),
    );
    const slots = new Map<number, StoredSlot>();
    for (let slot = 1; slot <= slotCount; slot++) {
      slots.set(slot, { state: "empty" });
    }
    for (const row of rows) {
      if (slots.has(row.slot)) {
        slots.set(row.slot, this.toStoredSlot(row));
      }
    }
    return slots;
  }

  readSlot(playerId: string, slot: number): StoredSlot {
    const row = this.withRetries(() =>
      this.db
        .prepare<[string, number], SlotRow>(
          "SELECT slot, stats, updated_at FROM saves WHERE player_id = ? AND slot = ?",
        )
        .get(playerId, slot),
    );
    return row ? this.toStoredSlot(row) : { state: "empty" };
  }

  /** Saves the slot's stats, creating the slot if it's new. */
  writeSlot(playerId: string, slot: number, stats: PlayerStats): void {
    const now = Date.now();
    this.withRetries(() =>
      this.db
        .prepare(
          `INSERT INTO saves (player_id, slot, stats, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (player_id, slot) DO UPDATE SET stats = excluded.stats,
             updated_at = excluded.updated_at`,
        )
        .run(playerId, slot, JSON.stringify(stats), now, now),
    );
  }

  deleteSlot(playerId: string, slot: number): void {
    this.withRetries(() =>
      this.db.prepare("DELETE FROM saves WHERE player_id = ? AND slot = ?").run(playerId, slot),
    );
  }

  close(): void {
    this.db.close();
  }

  private toStoredSlot(row: SlotRow): StoredSlot {
    const stats = parseStats(row.stats);
    return stats
      ? { state: "ready", stats, updatedAt: row.updated_at }
      : { state: "damaged", updatedAt: row.updated_at };
  }

  private migrate(): void {
    const version = Number(this.db.pragma("user_version", { simple: true }));
    if (version > Migrations.length) {
      throw new Error(
        `The saves database is from a newer version of the game (schema ${version}); ` +
          `this build only knows ${Migrations.length}. Update the game rather than risk the saves.`,
      );
    }
    for (let index = version; index < Migrations.length; index++) {
      const migration = Migrations[index];
      if (migration === undefined) {
        break;
      }
      this.db.transaction(() => {
        this.db.exec(migration);
        this.db.pragma(`user_version = ${index + 1}`);
      })();
    }
  }

  /** Runs `query`, trying again with a growing wait if the file is busy. */
  private withRetries<T>(query: () => T): T {
    const { MaxRetries, RetryBaseMs } = ServerConfig.Database;
    for (let attempt = 0; ; attempt++) {
      try {
        return query();
      } catch (error) {
        if (!isBusy(error) || attempt >= MaxRetries) {
          throw error;
        }
        pause(RetryBaseMs * 2 ** attempt);
      }
    }
  }
}
