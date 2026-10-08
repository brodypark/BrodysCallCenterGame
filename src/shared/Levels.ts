// The level curve (docs/design.md "Progression"): going from level 1 to 2 costs
// Config.XP.FirstLevelCost, and each level after that costs CostIncreasePerLevel more.

import { Config } from "@shared/Config";

export interface LevelProgress {
  level: number;
  // XP earned since reaching this level.
  xpIntoLevel: number;
  // XP this level takes to finish.
  xpForNextLevel: number;
}

/** XP it takes to go from `level` to the next one. */
export function costOf(level: number): number {
  return Config.XP.FirstLevelCost + Config.XP.CostIncreasePerLevel * (level - 1);
}

/** Total XP needed to reach `level` from 0. */
export function totalXpFor(level: number): number {
  const steps = Math.max(0, level - 1);
  return (
    steps * Config.XP.FirstLevelCost + (Config.XP.CostIncreasePerLevel * steps * (steps - 1)) / 2
  );
}

/** The level for `xp` total XP, and how far into it the player is. */
export function levelProgress(xp: number): LevelProgress {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 1;
  while (totalXpFor(level + 1) <= total) {
    level += 1;
  }
  return { level, xpIntoLevel: total - totalXpFor(level), xpForNextLevel: costOf(level) };
}

export function levelOf(xp: number): number {
  return levelProgress(xp).level;
}
