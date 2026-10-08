import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlayerStats, SavesSnapshot } from "@shared/types";
import { DataService } from "@server/services/DataService";
import { SaveService } from "@server/services/SaveService";
import { defaultStats, StatsService } from "@server/services/StatsService";

const PlayerId = "player-1";

let data: DataService;
let busy: boolean;
let sentSaves: SavesSnapshot[];
let sentStats: PlayerStats[];
let stats: StatsService;
let saves: SaveService;
let left: string[];

beforeEach(() => {
  data = new DataService(":memory:");
  busy = false;
  left = [];
  sentSaves = [];
  sentStats = [];
  stats = new StatsService({
    send: (_playerId, snapshot) => sentStats.push(snapshot),
    save: (playerId, snapshot) => saves.save(playerId, snapshot),
  });
  saves = new SaveService({
    data,
    stats,
    isBusy: () => busy,
    onLeave: (playerId) => left.push(playerId),
    send: (_playerId, snapshot) => sentSaves.push(snapshot),
  });
});

afterEach(() => {
  data.close();
});

describe("SaveService", () => {
  it("lists every slot, with nothing picked on a new visit", () => {
    const snapshot = saves.snapshot(PlayerId);
    expect(snapshot.activeSlot).toBeNull();
    expect(snapshot.slots.map((slot) => [slot.slot, slot.state])).toEqual([
      [1, "empty"],
      [2, "empty"],
      [3, "empty"],
    ]);
  });

  it("starts a new game in an empty slot and plays it", () => {
    saves.newGame(PlayerId, 2);
    expect(saves.activeSlot(PlayerId)).toBe(2);
    expect(sentSaves.at(-1)?.slots[1]).toMatchObject({ state: "ready", stats: defaultStats() });
    expect(sentStats.at(-1)).toEqual(defaultStats());
  });

  it("writes every stats change to the slot being played", () => {
    saves.newGame(PlayerId, 1);
    stats.update(PlayerId, (current) => {
      current.money += 150;
    });
    expect(data.readSlot(PlayerId, 1)).toMatchObject({ stats: { money: 150 } });
  });

  it("continues a saved slot on a later visit", () => {
    data.writeSlot(PlayerId, 3, { ...defaultStats(), money: 500, xp: 40 });
    saves.continueSlot(PlayerId, 3);
    expect(saves.activeSlot(PlayerId)).toBe(3);
    expect(stats.get(PlayerId)).toMatchObject({ money: 500, xp: 40 });
  });

  it("won't start a new game over a save, or continue an empty slot", () => {
    data.writeSlot(PlayerId, 1, { ...defaultStats(), money: 500 });
    saves.newGame(PlayerId, 1);
    expect(saves.activeSlot(PlayerId)).toBeNull();
    expect(data.readSlot(PlayerId, 1)).toMatchObject({ stats: { money: 500 } });

    saves.continueSlot(PlayerId, 2);
    expect(saves.activeSlot(PlayerId)).toBeNull();
  });

  it("plays one slot at a time until the player leaves it", () => {
    saves.newGame(PlayerId, 1);
    saves.newGame(PlayerId, 2);
    saves.continueSlot(PlayerId, 3);
    expect(saves.activeSlot(PlayerId)).toBe(1);

    busy = true;
    saves.leave(PlayerId);
    expect(saves.activeSlot(PlayerId)).toBe(1);

    busy = false;
    saves.leave(PlayerId);
    expect(saves.activeSlot(PlayerId)).toBeNull();
    expect(left).toEqual([PlayerId]);
  });

  it("deletes a slot, but never the one being played", () => {
    saves.newGame(PlayerId, 1);
    saves.deleteSlot(PlayerId, 1);
    expect(data.readSlot(PlayerId, 1).state).toBe("ready");

    data.writeSlot(PlayerId, 2, defaultStats());
    saves.deleteSlot(PlayerId, 2);
    expect(data.readSlot(PlayerId, 2).state).toBe("empty");
  });

  it("keeps the save after the session ends, ready to continue", () => {
    saves.newGame(PlayerId, 1);
    stats.update(PlayerId, (current) => {
      current.xp = 25;
    });
    saves.removePlayer(PlayerId);
    stats.removePlayer(PlayerId);
    expect(saves.activeSlot(PlayerId)).toBeNull();

    saves.continueSlot(PlayerId, 1);
    expect(stats.get(PlayerId).xp).toBe(25);
  });
});

describe("SaveService: a damaged save", () => {
  let folder: string;
  let file: string;

  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), "scamgpt-saves-"));
    file = path.join(folder, "saves.sqlite");
    data.close();
    data = new DataService(file);
    saves = new SaveService({
      data,
      stats,
      isBusy: () => false,
      onLeave: () => undefined,
      send: () => undefined,
    });
    const raw = new Database(file);
    raw
      .prepare(
        "INSERT INTO saves (player_id, slot, stats, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(PlayerId, 1, "{broken", 1, 1);
    raw.close();
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it("can't be continued or written over, only deleted", () => {
    expect(saves.snapshot(PlayerId).slots[0]?.state).toBe("damaged");
    saves.continueSlot(PlayerId, 1);
    saves.newGame(PlayerId, 1);
    expect(saves.activeSlot(PlayerId)).toBeNull();
    expect(data.readSlot(PlayerId, 1).state).toBe("damaged");

    saves.deleteSlot(PlayerId, 1);
    expect(data.readSlot(PlayerId, 1).state).toBe("empty");
  });
});
