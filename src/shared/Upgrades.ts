// What the Shop sells (docs/design.md "Upgrades"). Perks change gameplay and are applied by
// the server; wallpapers and themes only change the look and are applied by the client.

import { Config } from "@shared/Config";
import { DefaultTheme, DefaultWallpaper, type ThemeId, type WallpaperId } from "@shared/cosmetics";
import type { PlayerStats } from "@shared/stats";

export type UpgradeKind = "perk" | "wallpaper" | "theme";
export type PerkId = "extraCoffee" | "smoothTalker" | "stickyNotes";
export type UpgradeId = PerkId | WallpaperId | ThemeId;

interface UpgradeDetails {
  name: string;
  description: string;
  // What each tier costs, in order. One price for a cosmetic.
  prices: readonly number[];
}

export type Upgrade =
  | (UpgradeDetails & { kind: "perk"; id: PerkId })
  | (UpgradeDetails & { kind: "wallpaper"; id: WallpaperId })
  | (UpgradeDetails & { kind: "theme"; id: ThemeId });

function perk(id: PerkId, name: string, description: string): Upgrade {
  return { id, kind: "perk", name, description, prices: Config.Shop.PerkTierPrices };
}

function cosmeticPrice(id: WallpaperId | ThemeId): number {
  return id === DefaultWallpaper || id === DefaultTheme ? 0 : Config.Shop.CosmeticPrices[id];
}

function wallpaper(id: WallpaperId, name: string, description: string): Upgrade {
  return { id, kind: "wallpaper", name, description, prices: [cosmeticPrice(id)] };
}

function theme(id: ThemeId, name: string, description: string): Upgrade {
  return { id, kind: "theme", name, description, prices: [cosmeticPrice(id)] };
}

/** Everything in the shop, in shop order. */
export const AllUpgrades: readonly Upgrade[] = [
  perk(
    "extraCoffee",
    "Extra Coffee",
    `Longer shifts: +${Config.Shop.ExtraShiftSecondsPerTier} s per tier`,
  ),
  perk(
    "smoothTalker",
    "Smooth Talker",
    `Callers start ${Config.Shop.LowerStartingSuspicionPerTier} less suspicious per tier`,
  ),
  perk(
    "stickyNotes",
    "Sticky Notes",
    `+${Config.Shop.ExtraRedeemTriesPerTier} redeem try per card per tier`,
  ),
  wallpaper("teal", "Teal", "The classic."),
  wallpaper("midnightBlue", "Midnight Blue", "For the night shift."),
  wallpaper("sunsetGradient", "Sunset Gradient", "Very relaxing. Very professional."),
  wallpaper("hackerGrid", "Hacker Grid", "Makes typing look 40% faster."),
  wallpaper("puddingPink", "Pudding Pink", "Smells faintly of butterscotch."),
  theme("classic", "Classic Grey", "Grey. Reliable. Grey."),
  theme("darkMode", "Dark Mode", "Easy on the eyes during overtime."),
  theme("bubblegum", "Bubblegum", "Pink windows. No regrets."),
  theme("terminalGreen", "Terminal Green", "You're in the mainframe now."),
];

const byId = new Map<string, Upgrade>(AllUpgrades.map((upgrade) => [upgrade.id, upgrade]));

export function getUpgrade(id: string): Upgrade | undefined {
  return byId.get(id);
}

export function upgradesOfKind(kind: UpgradeKind): Upgrade[] {
  return AllUpgrades.filter((upgrade) => upgrade.kind === kind);
}

/** The tier the player owns: 0 for none, 1 for an owned cosmetic. Defaults count as owned. */
export function tierOf(stats: PlayerStats, id: UpgradeId): number {
  if (id === DefaultWallpaper || id === DefaultTheme) {
    return 1;
  }
  return stats.upgrades[id] ?? 0;
}

export function maxTier(upgrade: Upgrade): number {
  return upgrade.prices.length;
}

/** What the next tier costs, or null when it's maxed out (or owned, for a cosmetic). */
export function nextPrice(stats: PlayerStats, upgrade: Upgrade): number | null {
  return upgrade.prices[tierOf(stats, upgrade.id)] ?? null;
}

/** Perks: extra seconds per shift. */
export function extraShiftSeconds(stats: PlayerStats): number {
  return tierOf(stats, "extraCoffee") * Config.Shop.ExtraShiftSecondsPerTier;
}

/** Perks: how much less suspicious callers start. */
export function lowerStartingSuspicion(stats: PlayerStats): number {
  return tierOf(stats, "smoothTalker") * Config.Shop.LowerStartingSuspicionPerTier;
}

/** Perks: extra wrong tries per redeem code. */
export function extraRedeemTries(stats: PlayerStats): number {
  return tierOf(stats, "stickyNotes") * Config.Shop.ExtraRedeemTriesPerTier;
}
