import { beforeEach, describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import type { PlayerStats } from "@shared/stats";
import { extraRedeemTries, extraShiftSeconds, lowerStartingSuspicion } from "@shared/Upgrades";
import { type ShopClosedReason, ShopService } from "@server/services/ShopService";
import { defaultStats, StatsService } from "@server/services/StatsService";

const PlayerId = "player-1";
let stats: StatsService;
let shop: ShopService;
let closed: ShopClosedReason | null;
let saves: number;

function current(): PlayerStats {
  return stats.get(PlayerId);
}

beforeEach(() => {
  closed = null;
  saves = 0;
  stats = new StatsService({ send: () => undefined, save: () => (saves += 1) });
  shop = new ShopService({ stats, closedReason: () => closed });
  stats.load(PlayerId, { ...defaultStats(), money: 2000 });
});

describe("ShopService: perks", () => {
  it("sells perk tiers in order at their prices, up to the last tier", () => {
    const [first = 0, second = 0, third = 0] = Config.Shop.PerkTierPrices;
    stats.load(PlayerId, { ...defaultStats(), money: first + second });
    expect(shop.buy(PlayerId, "extraCoffee").success).toBe(true);
    expect(current()).toMatchObject({ money: second, upgrades: { extraCoffee: 1 } });
    shop.buy(PlayerId, "extraCoffee");
    expect(current().money).toBe(0);
    // Not enough for the third tier yet.
    expect(shop.buy(PlayerId, "extraCoffee").success).toBe(false);
    expect(current().upgrades.extraCoffee).toBe(2);
    stats.update(PlayerId, (s) => {
      s.money += third;
    });
    shop.buy(PlayerId, "extraCoffee");
    expect(shop.buy(PlayerId, "extraCoffee").message).toContain("maxed out");
  });

  it("needs enough banked money", () => {
    stats.load(PlayerId, { ...defaultStats(), money: 199 });
    expect(shop.buy(PlayerId, "stickyNotes")).toMatchObject({ success: false });
    expect(current().money).toBe(199);
  });

  it("is closed during shifts, and sells nothing that doesn't exist", () => {
    closed = "onShift";
    expect(shop.buy(PlayerId, "extraCoffee").message).toContain("closed");
    closed = null;
    expect(shop.buy(PlayerId, "freeMoney").success).toBe(false);
    expect(current().money).toBe(2000);
  });

  it("applies each perk's effect", () => {
    const owned: PlayerStats = {
      ...defaultStats(),
      upgrades: { extraCoffee: 3, smoothTalker: 2, stickyNotes: 1 },
    };
    expect(extraShiftSeconds(owned)).toBe(3 * Config.Shop.ExtraShiftSecondsPerTier);
    expect(lowerStartingSuspicion(owned)).toBe(2 * Config.Shop.LowerStartingSuspicionPerTier);
    expect(extraRedeemTries(owned)).toBe(Config.Shop.ExtraRedeemTriesPerTier);
    expect(extraShiftSeconds(defaultStats())).toBe(0);
  });
});

describe("ShopService: cosmetics", () => {
  it("equips a cosmetic when it's bought, and only sells it once", () => {
    expect(shop.buy(PlayerId, "hackerGrid").success).toBe(true);
    expect(current()).toMatchObject({ wallpaper: "hackerGrid", money: 2000 - 300 });
    expect(shop.buy(PlayerId, "hackerGrid").success).toBe(false);
  });

  it("equips owned cosmetics for free, and the defaults are always owned", () => {
    shop.buy(PlayerId, "darkMode");
    expect(shop.equip(PlayerId, "classic").success).toBe(true);
    expect(current().theme).toBe("classic");
    expect(shop.equip(PlayerId, "darkMode").success).toBe(true);
    expect(current()).toMatchObject({ theme: "darkMode", money: 2000 - 200 });
  });

  it("won't equip what isn't owned, or a perk", () => {
    expect(shop.equip(PlayerId, "bubblegum").success).toBe(false);
    expect(shop.equip(PlayerId, "extraCoffee").success).toBe(false);
    expect(current().theme).toBe("classic");
  });
});

describe("ShopService: closed and no-op requests", () => {
  it("says to pick a save when none is picked", () => {
    closed = "noSave";
    expect(shop.buy(PlayerId, "extraCoffee")).toMatchObject({
      success: false,
      message: "Pick a save first.",
    });
    expect(shop.equip(PlayerId, "classic").success).toBe(false);
  });

  it("doesn't save again when equipping what's already equipped", () => {
    expect(shop.equip(PlayerId, "classic").success).toBe(true);
    expect(saves).toBe(0);
  });
});
