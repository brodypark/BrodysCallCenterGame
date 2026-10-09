// What the Shop sells (docs/design.md "Upgrades"). Perks change gameplay and are applied by
// the server; wallpapers, themes, ringtones and pets only change the look and sound and are
// applied by the client.

import { Config } from "@shared/Config";
import {
  DefaultPet,
  DefaultRingtone,
  DefaultTheme,
  DefaultWallpaper,
  type PetId,
  type RingtoneId,
  type ThemeId,
  type WallpaperId,
} from "@shared/cosmetics";
import type { PlayerStats } from "@shared/stats";

export type UpgradeKind = "perk" | "wallpaper" | "theme" | "ringtone" | "pet";
export type CosmeticKind = Exclude<UpgradeKind, "perk">;
type TieredPerkId =
  | "extraCoffee"
  | "smoothTalker"
  | "stickyNotes"
  | "luckyCat"
  | "noiseCancellingHeadset"
  | "wobblebucksGold";
type OneTierPerkId = keyof typeof Config.Shop.OneTierPerkPrices;
export type PerkId = TieredPerkId | OneTierPerkId;
export type CosmeticId = WallpaperId | ThemeId | RingtoneId | PetId;
export type UpgradeId = PerkId | CosmeticId;

interface UpgradeDetails {
  name: string;
  description: string;
  // What each tier costs, in order. One price for a cosmetic.
  prices: readonly number[];
}

export type Upgrade =
  | (UpgradeDetails & { kind: "perk"; id: PerkId })
  | (UpgradeDetails & { kind: "wallpaper"; id: WallpaperId })
  | (UpgradeDetails & { kind: "theme"; id: ThemeId })
  | (UpgradeDetails & { kind: "ringtone"; id: RingtoneId })
  | (UpgradeDetails & { kind: "pet"; id: PetId });

function perk(id: TieredPerkId, name: string, description: string): Upgrade {
  return { id, kind: "perk", name, description, prices: Config.Shop.PerkTierPrices };
}

function oneTierPerk(id: OneTierPerkId, name: string, description: string): Upgrade {
  return { id, kind: "perk", name, description, prices: [Config.Shop.OneTierPerkPrices[id]] };
}

/** `value` raised by `percent` percent, rounded to whole dollars. */
function withBonus(value: number, percent: number): number {
  return Math.round((value * (100 + percent)) / 100);
}

type DefaultCosmeticId =
  typeof DefaultWallpaper | typeof DefaultTheme | typeof DefaultRingtone | typeof DefaultPet;

/** Whether `id` is a cosmetic every save owns without buying it. */
function isDefault(id: UpgradeId): id is DefaultCosmeticId {
  return (
    id === DefaultWallpaper || id === DefaultTheme || id === DefaultRingtone || id === DefaultPet
  );
}

function cosmeticPrice(id: CosmeticId): number {
  return isDefault(id) ? 0 : Config.Shop.CosmeticPrices[id];
}

function wallpaper(id: WallpaperId, name: string, description: string): Upgrade {
  return { id, kind: "wallpaper", name, description, prices: [cosmeticPrice(id)] };
}

function theme(id: ThemeId, name: string, description: string): Upgrade {
  return { id, kind: "theme", name, description, prices: [cosmeticPrice(id)] };
}

function ringtone(id: RingtoneId, name: string, description: string): Upgrade {
  return { id, kind: "ringtone", name, description, prices: [cosmeticPrice(id)] };
}

function pet(id: PetId, name: string, description: string): Upgrade {
  return { id, kind: "pet", name, description, prices: [cosmeticPrice(id)] };
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
  perk(
    "luckyCat",
    "Lucky Cat",
    `Gift cards pay +${Config.Shop.LuckyCatGiftCardBonusPercentPerTier}% per tier`,
  ),
  perk(
    "noiseCancellingHeadset",
    "Noise-Cancelling Headset",
    `Suspicion rises ${Config.Shop.HeadsetSuspicionRiseCutPercentPerTier}% less per tier`,
  ),
  perk(
    "wobblebucksGold",
    "Wobblebucks Gold Tier",
    `Wobblebucks charges pay +${Config.Shop.GoldTierChargeBonusPercentPerTier}% per tier`,
  ),
  oneTierPerk(
    "autoDialer",
    "Auto-Dialer",
    `Calls ring ${Config.Shop.AutoDialerSecondsSaved} s sooner`,
  ),
  oneTierPerk(
    "overclockedRouter",
    "Overclocked Router",
    `+${Config.Shop.RouterOvertimeExtraSeconds} s to finish your last call and cash in during overtime`,
  ),
  oneTierPerk(
    "vpnSubscription",
    "VPN Subscription",
    `Getting hacked by a trap code costs ${Config.Shop.VpnFineCutPercent}% less`,
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
  ringtone("classicBell", "Classic Bell", "Brrring brrring. Timeless."),
  ringtone("chiptune", "8-Bit Chiptune", "Every call is a boss fight."),
  ringtone("airhorn", "Airhorn", "Wakes the whole office. And the next one."),
  ringtone("dialUp", "Dial-Up Modem", "Connecting... connecting... connected?"),
  ringtone("yoPhone", "Yo Phone Linging", "Hey! Yo phone linging! Pick it up!"),
  pet("noPet", "No Pet", "Just you and the paperwork."),
  pet("petRock", "Pet Rock", "Very low maintenance. Very loyal. Very rock."),
  pet("pixelCat", "Pixel Cat", "Wanders your desktop, naps on the job. Relatable."),
  pet("deskBuddy", "Gizmo the Desk Buddy", "Gives free advice. Definitely not spyware."),
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
  if (isDefault(id)) {
    return 1;
  }
  return stats.upgrades[id] ?? 0;
}

/** The cosmetic the player has on of each kind. */
export function equippedCosmetic(stats: PlayerStats, kind: CosmeticKind): CosmeticId {
  switch (kind) {
    case "wallpaper":
      return stats.wallpaper;
    case "theme":
      return stats.theme;
    case "ringtone":
      return stats.ringtone;
    case "pet":
      return stats.pet;
  }
}

/** Whether `upgrade` is a cosmetic the player has on. */
export function isEquipped(stats: PlayerStats, upgrade: Upgrade): boolean {
  return upgrade.kind !== "perk" && equippedCosmetic(stats, upgrade.kind) === upgrade.id;
}

/** Puts a cosmetic on, in `stats`. */
export function equipInto(stats: PlayerStats, upgrade: Upgrade): void {
  switch (upgrade.kind) {
    case "wallpaper":
      stats.wallpaper = upgrade.id;
      break;
    case "theme":
      stats.theme = upgrade.id;
      break;
    case "ringtone":
      stats.ringtone = upgrade.id;
      break;
    case "pet":
      stats.pet = upgrade.id;
      break;
    case "perk":
      break;
  }
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

/** Perks: what a gift card worth `value` pays (Lucky Cat). */
export function giftCardPayout(stats: PlayerStats, value: number): number {
  return withBonus(
    value,
    tierOf(stats, "luckyCat") * Config.Shop.LuckyCatGiftCardBonusPercentPerTier,
  );
}

/** Perks: what charging `amount` to a Wobblebucks Card pays (Wobblebucks Gold Tier). */
export function chargePayout(stats: PlayerStats, amount: number): number {
  return withBonus(
    amount,
    tierOf(stats, "wobblebucksGold") * Config.Shop.GoldTierChargeBonusPercentPerTier,
  );
}

/** Perks: a suspicion change after the Noise-Cancelling Headset, which only softens rises.
 * Rounded to the nearest whole point. */
export function softenSuspicionRise(stats: PlayerStats, change: number): number {
  if (change <= 0) {
    return change;
  }
  const cut = Math.min(
    100,
    tierOf(stats, "noiseCancellingHeadset") * Config.Shop.HeadsetSuspicionRiseCutPercentPerTier,
  );
  return Math.round((change * (100 - cut)) / 100);
}

/** Perks: the wait before a call rings, from `seconds` (Auto-Dialer). */
export function secondsBeforeRing(stats: PlayerStats, seconds: number): number {
  const saved = tierOf(stats, "autoDialer") * Config.Shop.AutoDialerSecondsSaved;
  return Math.max(0, seconds - saved);
}

/** Perks: extra seconds on each overtime countdown (Overclocked Router). */
export function extraOvertimeSeconds(stats: PlayerStats): number {
  return tierOf(stats, "overclockedRouter") * Config.Shop.RouterOvertimeExtraSeconds;
}

/** Perks: what a bait caller's `fine` comes to after the VPN Subscription. */
export function baitFine(stats: PlayerStats, fine: number): number {
  const cut = tierOf(stats, "vpnSubscription") * Config.Shop.VpnFineCutPercent;
  return Math.round((fine * Math.max(0, 100 - cut)) / 100);
}
