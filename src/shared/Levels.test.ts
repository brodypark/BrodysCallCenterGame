import { describe, expect, it } from "vitest";
import { costOf, levelProgress, totalXpFor } from "@shared/Levels";

describe("Levels", () => {
  // The table in docs/design.md ("Progression").
  it.each([
    [2, 75, 75],
    [3, 100, 175],
    [4, 125, 300],
    [5, 150, 450],
    [6, 175, 625],
    [10, 275, 1575],
  ])("level %i costs %i XP, %i in total", (level, cost, total) => {
    expect(costOf(level - 1)).toBe(cost);
    expect(totalXpFor(level)).toBe(total);
  });

  it("works out the level and progress from total XP", () => {
    expect(levelProgress(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 75 });
    expect(levelProgress(74).level).toBe(1);
    expect(levelProgress(75)).toEqual({ level: 2, xpIntoLevel: 0, xpForNextLevel: 100 });
    expect(levelProgress(200)).toEqual({ level: 3, xpIntoLevel: 25, xpForNextLevel: 125 });
    expect(levelProgress(1575).level).toBe(10);
  });

  it("treats nonsense XP as none", () => {
    expect(levelProgress(-50).level).toBe(1);
    expect(levelProgress(Number.NaN).level).toBe(1);
  });
});
