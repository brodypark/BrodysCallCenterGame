import { describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import { averageOf, quotaForLevel } from "@server/services/quota";
import { AllScenarios } from "@server/scenarios/all";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";

// Level 1 averages $50, level 3 $75, level 5 $100.
const averages: Record<number, number> = { 1: 50, 2: 50, 3: 75, 4: 75, 5: 100 };
const average = (level: number): number => averages[Math.min(level, 5)] ?? 0;

describe("quotaForLevel", () => {
  it("is the base quota while the unlocked cards are worth the same as level 1's", () => {
    expect(quotaForLevel(1, average)).toBe(Config.Shift.Quota);
    expect(quotaForLevel(2, average)).toBe(Config.Shift.Quota);
  });

  it("passes on QuotaScaling of the card value growth, rounded", () => {
    const step = Config.Shift.QuotaRoundTo;
    const expected = (growth: number): number =>
      Math.round((Config.Shift.Quota * (1 + Config.Shift.QuotaScaling * growth)) / step) * step;
    expect(quotaForLevel(3, average)).toBe(expected(0.5));
    expect(quotaForLevel(5, average)).toBe(expected(1));
    expect(quotaForLevel(5, average) % step).toBe(0);
  });

  it("stops growing once every caller is unlocked", () => {
    expect(quotaForLevel(40, average)).toBe(quotaForLevel(5, average));
  });

  it("never drops below the base quota, and falls back to it on bad data", () => {
    expect(quotaForLevel(3, (level) => (level === 1 ? 100 : 50))).toBe(Config.Shift.Quota);
    expect(quotaForLevel(3, () => 0)).toBe(Config.Shift.Quota);
    expect(quotaForLevel(0, average)).toBe(Config.Shift.Quota);
  });

  it("rises with every level that unlocks bigger cards, for the real callers", () => {
    const registry = createScenarioRegistry(AllScenarios);
    const real = (level: number): number =>
      averageOf(registry.unlockedFor(level).map((scenario) => scenario.cardValue));
    const lastUnlock = Math.max(...registry.all.map((scenario) => scenario.unlockLevel));
    for (let level = 2; level <= lastUnlock; level += 1) {
      expect(quotaForLevel(level, real)).toBeGreaterThanOrEqual(quotaForLevel(level - 1, real));
    }
    expect(quotaForLevel(lastUnlock, real)).toBeGreaterThan(Config.Shift.Quota);
  });
});
