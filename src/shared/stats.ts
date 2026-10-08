// The player's stats, as a Zod schema. The type comes from the schema, so a save can never
// hold a field the schema doesn't know (which would be dropped on load). New fields get a
// default, so saves made before they existed still load.

import { z } from "zod";
import { DefaultTheme, DefaultWallpaper, ThemeIds, WallpaperIds } from "@shared/cosmetics";

const count = z.number().int().min(0).default(0);

export const PlayerStatsSchema = z.object({
  // Banked money. Doesn't include the current shift's earnings.
  money: count,
  // Total XP. The level is worked out from it (Levels.ts), not stored.
  xp: count,
  callsCompleted: count,
  successfulCalls: count,
  shiftsPassed: count,
  shiftsFailed: count,
  // Upgrades bought, by id (Upgrades.ts): a perk's tier, or 1 for a cosmetic. Missing means
  // not bought; the default wallpaper and theme are owned without being listed.
  upgrades: z.record(z.string(), z.number().int().min(0)).default({}),
  // The wallpaper and window theme in use. An unknown id (e.g. one that was removed) falls
  // back to the default instead of breaking the save.
  wallpaper: z.enum(WallpaperIds).catch(DefaultWallpaper).default(DefaultWallpaper),
  theme: z.enum(ThemeIds).catch(DefaultTheme).default(DefaultTheme),
  // True once the player has closed How to Play, so it only opens by itself the first time.
  tutorialSeen: z.boolean().default(false),
});

export type PlayerStats = z.output<typeof PlayerStatsSchema>;
