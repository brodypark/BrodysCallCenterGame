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

  it("gives extra tries with Sticky Notes", () => {
    const redeem = new RedeemService({ onRedeemed: () => undefined, extraTries: () => 2 });
    redeem.registerGiftCard(PlayerId, "GMA-7QZ", Grandma);
    expect(redeem.redeem(PlayerId, "GMA-7QX").triesRemaining).toBe(
      Config.Redeem.TriesPerCode + 2 - 1,
    );
  });
});

describe("RedeemService: Wobblebucks Cards", () => {
  const Card = "WBK-7QZ";
  const Limit = 40;

  function withCard(): { redeem: RedeemService; charged: number[]; locked: number[] } {
    const charged: number[] = [];
    const locked: number[] = [];
    const redeem = new RedeemService({
      onRedeemed: () => undefined,
      onCharged: (_playerId, amount) => charged.push(amount),
      onLocked: () => locked.push(1),
    });
    redeem.registerWobblebucksCard(PlayerId, Card, Limit, "Easy");
    return { redeem, charged, locked };
  }

  it("approves a charge within the hidden limit, once", () => {
    const { redeem, charged } = withCard();
    expect(redeem.charge(PlayerId, " wbk 7qz ", Limit)).toMatchObject({
      success: true,
      payout: Limit,
    });
    expect(redeem.charge(PlayerId, Card, 1)).toMatchObject({
      success: false,
      message: "You already charged this card.",
    });
    expect(charged).toEqual([Limit]);
  });

  it("declines a charge over the limit, then freezes the card", () => {
    const { redeem, charged, locked } = withCard();
    expect(redeem.charge(PlayerId, Card, Limit + 1)).toMatchObject({
      success: false,
      triesRemaining: Config.Card.TriesPerCard - 1,
    });
    for (let tries = Config.Card.TriesPerCard - 2; tries > 0; tries--) {
      redeem.charge(PlayerId, Card, Limit + 1);
    }
    expect(redeem.charge(PlayerId, Card, Limit + 1)).toMatchObject({
      triesRemaining: 0,
      message: "Declined! That card is now frozen.",
    });
    // Frozen: even a fair amount is turned away now.
    expect(redeem.charge(PlayerId, Card, 1)).toMatchObject({ success: false, triesRemaining: 0 });
    expect(charged).toEqual([]);
    expect(locked).toHaveLength(1);
  });

  it("costs a try for a mistyped card", () => {
    const { redeem } = withCard();
    expect(redeem.charge(PlayerId, "WBK-7QX", 10)).toMatchObject({
      success: false,
      triesRemaining: Config.Card.TriesPerCard - 1,
    });
  });

  it("turns away bad amounts without costing a try", () => {
    const { redeem } = withCard();
    for (const amount of [0, -5, 2.5, Number.NaN, Config.Card.MaxChargeAmount + 1]) {
      expect(redeem.charge(PlayerId, Card, amount)).toMatchObject({
        success: false,
        triesRemaining: null,
      });
    }
    expect(redeem.charge(PlayerId, Card, Limit)).toMatchObject({ success: true });
  });

  it("sends each kind of card to its own app without costing a try", () => {
    const { redeem } = withCard();
    redeem.registerGiftCard(PlayerId, "GMA-ABC", Grandma);
    expect(redeem.redeem(PlayerId, Card)).toMatchObject({
      success: false,
      triesRemaining: null,
      message: "That's a Wobblebucks Card. Charge it in the Wobblebucks Machine.",
    });
    expect(redeem.charge(PlayerId, "GMA-ABC", 10)).toMatchObject({
      success: false,
      triesRemaining: null,
      message: "That's a gift card code. Cash it in with the Redeem app.",
    });
    // Both still have every try.
    expect(redeem.charge(PlayerId, Card, Limit)).toMatchObject({ success: true });
    expect(redeem.redeem(PlayerId, "GMA-ABC")).toMatchObject({ success: true });
  });

  it("never matches a gift card's typo to a Wobblebucks Card, or the other way round", () => {
    const { redeem } = withCard();
    expect(redeem.redeem(PlayerId, "GMA-7QZ")).toMatchObject({
      success: false,
      message: "No card matches that code.",
    });
  });
});
