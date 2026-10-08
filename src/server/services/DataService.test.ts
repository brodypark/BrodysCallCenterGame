import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DataService } from "@server/services/DataService";
import { defaultStats } from "@server/services/StatsService";

const PlayerId = "player-1";
let data: DataService;

beforeEach(() => {
  data = new DataService(":memory:");
});

afterEach(() => {
  data.close();
});

describe("DataService", () => {
  it("starts every slot empty", () => {
    const slots = data.listSlots(PlayerId, 3);
    expect([...slots.keys()]).toEqual([1, 2, 3]);
    expect([...slots.values()].every((slot) => slot.state === "empty")).toBe(true);
  });

  it("saves, loads, overwrites and deletes a slot", () => {
    data.writeSlot(PlayerId, 2, { ...defaultStats(), money: 150 });
    expect(data.readSlot(PlayerId, 2)).toMatchObject({ state: "ready", stats: { money: 150 } });

    data.writeSlot(PlayerId, 2, { ...defaultStats(), money: 300 });
    expect(data.readSlot(PlayerId, 2)).toMatchObject({ stats: { money: 300 } });

    data.deleteSlot(PlayerId, 2);
    expect(data.readSlot(PlayerId, 2)).toEqual({ state: "empty" });
  });

  it("keeps each player's slots separate", () => {
    data.writeSlot(PlayerId, 1, { ...defaultStats(), money: 50 });
    expect(data.readSlot("someone-else", 1)).toEqual({ state: "empty" });
  });
});

describe("DataService: saves written some other way", () => {
  let folder: string;
  let file: string;
  let fileData: DataService;

  /** Writes a row straight into the database, the way an older or broken save looks. */
  function writeRaw(slot: number, json: string, updatedAt: number): void {
    const raw = new Database(file);
    raw
      .prepare(
        "INSERT INTO saves (player_id, slot, stats, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(PlayerId, slot, json, updatedAt, updatedAt);
    raw.close();
  }

  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), "scamgpt-test-"));
    file = path.join(folder, "saves.sqlite");
    fileData = new DataService(file);
  });

  afterEach(() => {
    fileData.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it("fills in fields an older save doesn't have", () => {
    writeRaw(1, JSON.stringify({ money: 75 }), 1);
    expect(fileData.readSlot(PlayerId, 1)).toEqual({
      state: "ready",
      stats: { ...defaultStats(), money: 75 },
      updatedAt: 1,
    });
  });

  it("reports a save it can't read as damaged instead of guessing", () => {
    writeRaw(3, "{not json", 5);
    expect(fileData.readSlot(PlayerId, 3)).toEqual({ state: "damaged", updatedAt: 5 });
    expect(fileData.listSlots(PlayerId, 3).get(3)?.state).toBe("damaged");
  });

  it("creates the database's folder, and opens an existing database again", () => {
    fileData.writeSlot(PlayerId, 2, { ...defaultStats(), money: 10 });
    fileData.close();
    fileData = new DataService(file);
    expect(fileData.readSlot(PlayerId, 2)).toMatchObject({ stats: { money: 10 } });
  });
});
