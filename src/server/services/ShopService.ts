// The upgrades shop (docs/design.md "Upgrades"): buying perks and cosmetics with banked
// money, and equipping owned wallpapers, themes, ringtones and pets. Only between shifts. The server checks
// every purchase; the client only asks. In Sandbox, money is unlimited: everything is free.

import type { ShopResult } from "@shared/types";
import { equipInto, getUpgrade, isEquipped, maxTier, nextPrice, tierOf } from "@shared/Upgrades";
import type { StatsService } from "@server/services/StatsService";

export interface ShopServiceOptions {
  stats: StatsService;
  // Why the shop is closed for the player right now, or null while it's open.
  closedReason: (playerId: string) => ShopClosedReason | null;
  // True while purchases cost nothing (Sandbox's unlimited money).
  isFree?: (playerId: string) => boolean;
}

export type ShopClosedReason = "onShift" | "noSave";

const ClosedMessages: Readonly<Record<ShopClosedReason, string>> = {
  onShift: "The shop is closed during shifts.",
  noSave: "Pick a save first.",
};

function result(success: boolean, message: string): ShopResult {
  return { success, message };
}

export class ShopService {
  private readonly options: ShopServiceOptions;

  constructor(options: ShopServiceOptions) {
    this.options = options;
  }

  /** Buys the next tier of a perk, or a cosmetic (which is equipped straight away). */
  buy(playerId: string, id: string): ShopResult {
    const upgrade = getUpgrade(id);
    if (!upgrade) {
      return result(false, "That isn't for sale.");
    }
    const closed = this.options.closedReason(playerId);
    if (closed !== null) {
      return result(false, ClosedMessages[closed]);
    }
    const stats = this.options.stats.get(playerId);
    const price = nextPrice(stats, upgrade);
    if (price === null) {
      return result(
        false,
        upgrade.kind === "perk"
          ? `${upgrade.name} is maxed out.`
          : `You already own ${upgrade.name}.`,
      );
    }
    const free = this.options.isFree?.(playerId) ?? false;
    if (!free && stats.money < price) {
      return result(false, `Not enough money: ${upgrade.name} costs $${price}.`);
    }
    const tier = tierOf(stats, upgrade.id) + 1;
    this.options.stats.update(playerId, (current) => {
      if (!free) {
        current.money -= price;
      }
      current.upgrades = { ...current.upgrades, [upgrade.id]: tier };
      equipInto(current, upgrade);
    });
    if (upgrade.kind !== "perk") {
      return result(true, `Bought and equipped ${upgrade.name}.`);
    }
    return maxTier(upgrade) > 1
      ? result(true, `Bought ${upgrade.name} tier ${tier} of ${maxTier(upgrade)}.`)
      : result(true, `Bought ${upgrade.name}.`);
  }

  /** Equips an owned wallpaper, theme, ringtone or pet. Free. */
  equip(playerId: string, id: string): ShopResult {
    const upgrade = getUpgrade(id);
    if (!upgrade || upgrade.kind === "perk") {
      return result(false, "That can't be equipped.");
    }
    const closed = this.options.closedReason(playerId);
    if (closed !== null) {
      return result(false, ClosedMessages[closed]);
    }
    const stats = this.options.stats.get(playerId);
    if (tierOf(stats, upgrade.id) === 0) {
      return result(false, `You don't own ${upgrade.name} yet.`);
    }
    if (isEquipped(stats, upgrade)) {
      return result(true, `${upgrade.name} is already equipped.`);
    }
    this.options.stats.update(playerId, (current) => equipInto(current, upgrade));
    return result(true, `Equipped ${upgrade.name}.`);
  }
}
