import { describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import { AllScenarios } from "@server/scenarios/all";
import { grandma } from "@server/scenarios/grandma";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import type { ScenarioInput } from "@server/scenarios/scenarioSchema";

/** Grandma with some changes, for testing what the registry accepts. */
function variant(changes: Partial<ScenarioInput>): ScenarioInput {
  return { ...grandma, ...changes };
}

const zorp = variant({ id: "zorp", codePrefix: "ZRP", unlockLevel: 3 });
const bill = variant({ id: "bill", codePrefix: "BRN", unlockLevel: 5 });

describe("createScenarioRegistry", () => {
  it("accepts every real scenario", () => {
    expect(() => createScenarioRegistry(AllScenarios)).not.toThrow();
  });

  it("rejects duplicate ids and code prefixes", () => {
    expect(() => createScenarioRegistry([grandma, variant({ codePrefix: "ZZZ" })])).toThrow(/id/);
    expect(() => createScenarioRegistry([grandma, variant({ id: "copy" })])).toThrow(/prefix/);
  });

  it("rejects broken values", () => {
    const broken: ScenarioInput[] = [
      variant({ codePrefix: Config.Card.Prefix }),
      variant({ codePrefix: "gm" }),
      variant({ trustLevel: 100 }),
      variant({ startingSuspicion: 100 }),
      variant({ cardValue: 0 }),
      variant({ lines: { ...grandma.lines, revealLine: "No code here." } }),
      variant({ lines: { ...grandma.lines, greetings: [] } }),
      variant({
        lines: { ...grandma.lines, hangUpLine: "x".repeat(Config.AI.MaxReplyLength + 1) },
      }),
    ];
    for (const scenario of broken) {
      expect(() => createScenarioRegistry([scenario])).toThrow();
    }
  });

  it("needs a scenario for new players", () => {
    expect(() => createScenarioRegistry([zorp])).toThrow(/unlockLevel 1/);
  });
});

describe("ScenarioRegistry", () => {
  const registry = createScenarioRegistry([bill, grandma, zorp]);

  it("sorts by unlock level and finds by id", () => {
    expect(registry.all.map((scenario) => scenario.id)).toEqual(["grandma", "zorp", "bill"]);
    expect(registry.get("zorp")?.displayName).toBe(grandma.displayName);
    expect(registry.get("nobody")).toBeUndefined();
  });

  it("only offers scenarios unlocked at the player's level", () => {
    expect(registry.unlockedFor(1).map((scenario) => scenario.id)).toEqual(["grandma"]);
    expect(registry.unlockedFor(4).map((scenario) => scenario.id)).toEqual(["grandma", "zorp"]);
  });

  it("never picks the same scenario twice in a row when there's a choice", () => {
    for (const roll of [0, 0.5, 0.99]) {
      expect(registry.pick(5, "zorp", () => roll).id).not.toBe("zorp");
    }
  });

  it("picks the only unlocked scenario even if it called last", () => {
    expect(registry.pick(1, "grandma", () => 0.5).id).toBe("grandma");
  });
});
