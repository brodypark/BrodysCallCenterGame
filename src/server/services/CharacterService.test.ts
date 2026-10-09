import { beforeEach, describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import { totalXpFor } from "@shared/Levels";
import type { CallerPage, CharactersSnapshot, UnlockedCallerPage } from "@shared/types";
import { AllScenarios } from "@server/scenarios/all";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import { CharacterService } from "@server/services/CharacterService";
import { defaultStats, StatsService } from "@server/services/StatsService";

const PlayerId = "player-1";
const scenarios = createScenarioRegistry(AllScenarios);
const { ScamsForHint, ChargesForLimit } = Config.Characters;

let stats: StatsService;
let characters: CharacterService;
let sandbox: boolean;
let sent: CharactersSnapshot[];
let learned: string[];

function page(id: string): CallerPage {
  const found = characters.snapshot(PlayerId).pages.find((each) => each.id === id);
  if (!found) {
    throw new Error(`No page for ${id}`);
  }
  return found;
}

function unlockedPage(id: string): UnlockedCallerPage {
  const found = page(id);
  if (!found.unlocked) {
    throw new Error(`${id} is locked`);
  }
  return found;
}

function hintText(id: string, kind: string): string | null | undefined {
  return unlockedPage(id).hints.find((each) => each.kind === kind)?.text;
}

function scam(id: string, times: number): void {
  for (let time = 0; time < times; time += 1) {
    characters.scammed(PlayerId, id);
  }
}

beforeEach(() => {
  sandbox = false;
  sent = [];
  learned = [];
  stats = new StatsService({
    send: () => characters.publish(PlayerId),
    save: () => undefined,
  });
  characters = new CharacterService({
    scenarios,
    stats,
    revealAll: () => sandbox,
    send: (_playerId, snapshot) => sent.push(snapshot),
    onLearned: (_playerId, scenarioId) => learned.push(scenarioId),
  });
  stats.load(PlayerId, defaultStats());
});

describe("CharacterService", () => {
  it("has a page for every caller, in unlock order", () => {
    const pages = characters.snapshot(PlayerId).pages;
    expect(pages.map((each) => each.id)).toEqual(scenarios.all.map((each) => each.id));
  });

  it("shows only the name and unlock level of callers the player hasn't reached", () => {
    const locked = page("jordan");
    expect(locked).toEqual({
      unlocked: false,
      id: "jordan",
      name: "Jordan",
      unlockLevel: scenarios.get("jordan")?.unlockLevel,
    });
    expect(page("grandma").unlocked).toBe(true);
  });

  it("unlocks a caller's page when the player reaches their level", () => {
    const level = scenarios.get("hudson")?.unlockLevel ?? 1;
    stats.update(PlayerId, (current) => {
      current.xp = totalXpFor(level);
    });
    expect(page("hudson").unlocked).toBe(true);
    expect(sent.at(-1)?.pages.find((each) => each.id === "hudson")?.unlocked).toBe(true);
  });

  it("keeps every hint hidden until it's earned", () => {
    const fresh = unlockedPage("grandma");
    expect(fresh.scams).toBe(0);
    for (const each of fresh.hints) {
      expect(each.text).toBeNull();
      expect(each.remaining).toBeGreaterThan(0);
    }
    // None of the hidden text reaches the client.
    const sentText = JSON.stringify(characters.snapshot(PlayerId));
    const dossier = scenarios.get("grandma")?.dossier;
    expect(sentText).not.toContain(dossier?.obsession);
    expect(sentText).not.toContain(dossier?.dislikes);
    expect(sentText).not.toContain("takes charges up to");
  });

  it("unlocks likes, dislikes and the obsession as the player scams them", () => {
    scam("grandma", ScamsForHint.likes);
    expect(hintText("grandma", "likes")).toBe(scenarios.get("grandma")?.dossier.likes);
    expect(hintText("grandma", "dislikes")).toBeNull();

    scam("grandma", ScamsForHint.dislikes - ScamsForHint.likes);
    expect(hintText("grandma", "dislikes")).not.toBeNull();
    expect(hintText("grandma", "obsession")).toBeNull();

    scam("grandma", ScamsForHint.obsession - ScamsForHint.dislikes);
    expect(hintText("grandma", "obsession")).not.toBeNull();
    expect(unlockedPage("grandma").scams).toBe(ScamsForHint.obsession);
    // Scams don't teach the spending limit.
    expect(hintText("grandma", "spendingLimit")).toBeNull();
  });

  it("counts down to each hint", () => {
    const likes = unlockedPage("grandma").hints.find((each) => each.kind === "likes");
    expect(likes?.remaining).toBe(ScamsForHint.likes);
  });

  it("learns the spending limit from charging their Wobblebucks Card", () => {
    for (let time = 0; time < ChargesForLimit; time += 1) {
      characters.charged(PlayerId, "grandma");
    }
    expect(hintText("grandma", "spendingLimit")).toContain(
      `$${scenarios.get("grandma")?.sideProblem?.spendingLimit}`,
    );
  });

  it("says when a scam or charge teaches a new hint, and only then", () => {
    scam("grandma", ScamsForHint.obsession + 1);
    expect(learned).toEqual(["grandma", "grandma", "grandma"]);
    characters.charged(PlayerId, "hudson");
    expect(learned.at(-1)).toBe("hudson");
  });

  it("saves what the player did to each caller", () => {
    scam("grandma", 2);
    characters.charged(PlayerId, "grandma");
    expect(stats.get(PlayerId).callers.grandma).toEqual({ scams: 2, charges: 1 });
  });

  it("ignores scenarios that don't exist", () => {
    characters.scammed(PlayerId, "nobody");
    expect(stats.get(PlayerId).callers).toEqual({});
  });

  it("shows every page in full in Sandbox", () => {
    sandbox = true;
    for (const each of characters.snapshot(PlayerId).pages) {
      expect(each.unlocked).toBe(true);
      if (each.unlocked) {
        expect(each.hints.every((one) => one.text !== null && one.remaining === 0)).toBe(true);
      }
    }
  });
});
