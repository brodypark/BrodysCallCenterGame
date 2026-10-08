import { describe, expect, it } from "vitest";
import { levelOf, totalXpFor } from "@shared/Levels";
import { PlayerStatsSchema } from "@shared/stats";
import { matchDevCommand } from "@server/prompts/DevCommands";

describe("matchDevCommand", () => {
  it("ignores normal messages", () => {
    expect(matchDevCommand("hello grandma")).toBeNull();
    expect(matchDevCommand("__proto__")).toBeNull();
    expect(matchDevCommand("constructor")).toBeNull();
  });

  it("!xp stops 1 XP short of the next level, then moves up a level each time", () => {
    const stats = PlayerStatsSchema.parse({});
    const xp = matchDevCommand(" !XP ");
    xp?.(stats);
    expect(stats.xp).toBe(totalXpFor(2) - 1);
    expect(levelOf(stats.xp)).toBe(1);
    xp?.(stats);
    expect(stats.xp).toBe(totalXpFor(3) - 1);
    expect(levelOf(stats.xp)).toBe(2);
  });

  it("!money adds 1000", () => {
    const stats = PlayerStatsSchema.parse({ money: 5 });
    matchDevCommand("!money")?.(stats);
    expect(stats.money).toBe(1005);
  });

  it("jumps straight to a level with !level", () => {
    const stats = PlayerStatsSchema.parse({});
    matchDevCommand("!level 11")?.(stats);
    expect(levelOf(stats.xp)).toBe(11);
    matchDevCommand("!LEVEL 1")?.(stats);
    expect(levelOf(stats.xp)).toBe(1);
    expect(matchDevCommand("!level eleven")).toBeNull();
  });
});
