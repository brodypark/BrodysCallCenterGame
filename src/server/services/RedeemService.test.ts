import { describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import { RedeemService } from "@server/services/RedeemService";

const PlayerId = "player-1";
const Grandma = { value: 50, difficulty: "Easy" } as const;

function setup(): { redeem: RedeemService; paid: number[] } {
  const paid: number[] = [];
  const redeem = new RedeemService({ onRedeemed: (_playerId, card) => paid.push(card.value) });
  return { redeem, paid };
}

describe("RedeemService", () => {
  it("cashes in a revealed code once, however it's typed", () => {
    const { redeem, paid } = setup();
    redeem.registerGiftCard(PlayerId, "GMA-7QZ", Grandma);
    expect(redeem.redeem(PlayerId, " gma 7qz ")).toMatchObject({ success: true, payout: 50 });
    expect(redeem.redeem(PlayerId, "GMA-7QZ")).toMatchObject({
      success: false,
      message: "You already cashed in this card.",
    });
    expect(paid).toEqual([50]);
  });

  it("locks a card after too many wrong tries", () => {
    const { redeem, paid } = setup();
    redeem.registerGiftCard(PlayerId, "GMA-7QZ", Grandma);
    for (let tries = Config.Redeem.TriesPerCode - 1; tries > 0; tries--) {
      expect(redeem.redeem(PlayerId, "GMA-7QX")).toMatchObject({
        success: false,
        triesRemaining: tries,
      });
    }
    expect(redeem.redeem(PlayerId, "GMA-7QX")).toMatchObject({
      triesRemaining: 0,
      message: "Wrong code. That card is now locked!",
    });
    expect(redeem.redeem(PlayerId, "GMA-7QZ")).toMatchObject({ success: false, triesRemaining: 0 });
    expect(paid).toEqual([]);
    expect(redeem.hasRedeemableCards(PlayerId)).toBe(false);
  });

  it("charges a wrong guess to the closest card", () => {
    const { redeem } = setup();
    redeem.registerGiftCard(PlayerId, "GMA-7QZ", Grandma);
    redeem.registerGiftCard(PlayerId, "GMA-BCD", Grandma);
    redeem.redeem(PlayerId, "GMA-BCF");
    // GMA-BCD lost a try; GMA-7QZ still has all of its.
    expect(redeem.redeem(PlayerId, "GMA-7QX")).toMatchObject({
      triesRemaining: Config.Redeem.TriesPerCode - 1,
    });
    expect(redeem.redeem(PlayerId, "GMA-BCF")).toMatchObject({
      triesRemaining: Config.Redeem.TriesPerCode - 2,
    });
  });

  it("doesn't cost a try for a typo of a card that's already cashed in", () => {
    const { redeem } = setup();
    redeem.registerGiftCard(PlayerId, "GMA-7QZ", Grandma);
    redeem.redeem(PlayerId, "GMA-7QZ");
    expect(redeem.redeem(PlayerId, "GMA-7QX")).toMatchObject({
      triesRemaining: null,
      message: "You already cashed in this card.",
    });
  });

  it("turns away junk, Wobblebucks Cards and codes nobody read out, for free", () => {
    const { redeem } = setup();
    expect(redeem.redeem(PlayerId, "GMA-7QZ").message).toBe("No card matches that code.");
    redeem.registerGiftCard(PlayerId, "GMA-7QZ", Grandma);
    expect(redeem.redeem(PlayerId, "").message).toBe("That doesn't look like a card code.");
    expect(redeem.redeem(PlayerId, "GMA-7Q!").message).toBe("That doesn't look like a card code.");
    expect(redeem.redeem(PlayerId, "x".repeat(Config.Redeem.MaxCodeInputLength + 1)).message).toBe(
      "That doesn't look like a card code.",
    );
    expect(redeem.redeem(PlayerId, `${Config.Card.Prefix}-7QZ`).message).toContain("Wobblebucks");
    expect(redeem.redeem(PlayerId, "GMA-7QZ").success).toBe(true);
  });

  it("keeps each player's cards separate", () => {
    const { redeem } = setup();
    redeem.registerGiftCard(PlayerId, "GMA-7QZ", Grandma);
    expect(redeem.redeem("someone-else", "GMA-7QZ").message).toBe("No card matches that code.");
  });

  it("never generates a code the player already has", () => {
    const { redeem } = setup();
    const seen = new Set<string>();
    for (let index = 0; index < 300; index++) {
      const code = redeem.generateCode(PlayerId, "GMA");
      expect(seen.has(code)).toBe(false);
      seen.add(code);
      redeem.registerGiftCard(PlayerId, code, Grandma);
    }
  });
});
