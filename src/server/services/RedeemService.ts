// Keeps each player's revealed cards: gift card codes, cashed in whole in the Redeem app,
// and Wobblebucks Cards (a side problem fixed for a fee), charged any amount up to a hidden
// spending limit in the Wobblebucks Machine. Ported from the Roblox RedeemService. It holds
// no money: onRedeemed and onCharged are told when a card pays, and pay.
//
// Codes are stored normalized (capitals, no spaces or dashes), so "gma 7qz" matches
// GMA-7QZ. A wrong guess is matched to the closest card of that kind and costs one of its
// tries; so does charging more than a Wobblebucks Card's limit. Out of tries, the card
// locks (a gift card after Config.Redeem.TriesPerCode, a Wobblebucks Card after
// Config.Card.TriesPerCard). Each app turns away the other's cards without costing a try.

import { normalizeCode } from "@shared/cardCode";
import { Config } from "@shared/Config";
import type { Difficulty, RedeemResult } from "@shared/types";
import { generateCode } from "@server/services/codes";

// giftCard: cashed in whole in the Redeem app. wobblebucks: charged in the Wobblebucks
// Machine, up to its spending limit.
type CardKind = "giftCard" | "wobblebucks";

/** A gift card: what it pays, and the scenario it came from. */
export interface GiftCardInfo {
  value: number;
  // Sets the XP for cashing it in.
  difficulty: Difficulty;
  scenarioId: string;
}

/** A Wobblebucks Card: the most it can be charged, and the scenario it came from. */
export interface WobblebucksCardInfo {
  spendingLimit: number;
  difficulty: Difficulty;
  scenarioId: string;
}

interface IssuedCard {
  kind: CardKind;
  // A gift card pays this when it's redeemed; a Wobblebucks Card can be charged up to it.
  value: number;
  // The scenario's difficulty, which sets the XP for cashing it in.
  difficulty: Difficulty;
  // The scenario whose victim read it out.
  scenarioId: string;
  // Wrong tries (or declined charges) left before the card locks. 0 means locked.
  triesLeft: number;
  // Cashed in or charged. Each card pays out once.
  redeemed: boolean;
  // Goes up with every card issued, so ties can go to the newest one.
  order: number;
}

interface PlayerCards {
  // Every card revealed to this player, keyed by its normalized code.
  cards: Map<string, IssuedCard>;
  issued: number;
}

export interface RedeemServiceOptions {
  // A gift card was cashed in.
  onRedeemed: (playerId: string, card: GiftCardInfo) => void;
  // A Wobblebucks Card from scenario `scenarioId` was charged `amount`.
  onCharged?: (playerId: string, amount: number, scenarioId: string) => void;
  // A card ran out of tries and can't be cashed in any more.
  onLocked?: (playerId: string) => void;
  // Extra wrong tries per card for this player (the Sticky Notes perk).
  extraTries?: (playerId: string) => number;
}

const NotACode = "That doesn't look like a card code.";
const WobblebucksInRedeem = "That's a Wobblebucks Card. Charge it in the Wobblebucks Machine.";
const GiftCardInMachine = "That's a gift card code. Cash it in with the Redeem app.";
const OnlyLettersAndDigits = /^[A-Z0-9]+$/;

function result(
  success: boolean,
  payout: number,
  triesRemaining: number | null,
  message: string,
): RedeemResult {
  return { success, payout, triesRemaining, message };
}

/** How many single-character edits turn `a` into `b`. Used to work out which card a wrong
 * guess was meant to be. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

function isRedeemable(card: IssuedCard): boolean {
  return !card.redeemed && card.triesLeft > 0;
}

/** When two cards are equally close to a guess, whether `candidate` should win: one that
 * can still be redeemed first, then the newer one. */
function isBetterTie(candidate: IssuedCard, current: IssuedCard): boolean {
  if (isRedeemable(candidate) !== isRedeemable(current)) {
    return isRedeemable(candidate);
  }
  return candidate.order > current.order;
}

export class RedeemService {
  private readonly players = new Map<string, PlayerCards>();
  private readonly onRedeemed: RedeemServiceOptions["onRedeemed"];
  private readonly onCharged: NonNullable<RedeemServiceOptions["onCharged"]>;
  private readonly onLocked: NonNullable<RedeemServiceOptions["onLocked"]>;
  private readonly extraTries: NonNullable<RedeemServiceOptions["extraTries"]>;

  constructor(options: RedeemServiceOptions) {
    this.onRedeemed = options.onRedeemed;
    this.onCharged = options.onCharged ?? (() => undefined);
    this.onLocked = options.onLocked ?? (() => undefined);
    this.extraTries = options.extraTries ?? (() => 0);
  }

  /** A new code with `prefix` that's different from every card the player has. Not
   * redeemable until it's registered. */
  generateCode(playerId: string, prefix: string): string {
    const cards = this.players.get(playerId)?.cards;
    return generateCode(prefix, (normalized) => cards?.has(normalized) ?? false);
  }

  /** Makes `code` redeemable by the player for `value`. Call it when the victim reads it
   * out. Registering the same code again does nothing. */
  registerGiftCard(playerId: string, code: string, card: GiftCardInfo): void {
    this.register(playerId, code, {
      kind: "giftCard",
      ...card,
      triesLeft: Config.Redeem.TriesPerCode + this.extraTries(playerId),
    });
  }

  /** Makes Wobblebucks Card `card` chargeable by the player, up to its spending limit in
   * dollars. Call it when the victim reads it out. Registering the same card again does
   * nothing. */
  registerWobblebucksCard(playerId: string, card: string, info: WobblebucksCardInfo): void {
    this.register(playerId, card, {
      kind: "wobblebucks",
      value: info.spendingLimit,
      difficulty: info.difficulty,
      scenarioId: info.scenarioId,
      triesLeft: Config.Card.TriesPerCard,
    });
  }

  /** Tries to cash in what the player typed into the Redeem app. */
  redeem(playerId: string, input: string): RedeemResult {
    const typed = normalizeCode(input);
    if (input.length > Config.Redeem.MaxCodeInputLength || !OnlyLettersAndDigits.test(typed)) {
      return result(false, 0, null, NotACode);
    }
    if (typed.startsWith(Config.Card.Prefix)) {
      return result(false, 0, null, WobblebucksInRedeem);
    }
    const match = this.findCard(playerId, typed, "giftCard");
    if (!match) {
      return result(false, 0, null, "No card matches that code.");
    }
    const { card, exact } = match;
    // A typo of a card that's already done costs nothing, and never touches another card.
    if (card.redeemed) {
      return result(false, 0, null, "You already cashed in this card.");
    }
    if (card.triesLeft <= 0) {
      return result(false, 0, 0, "This card is locked. Too many wrong tries.");
    }
    if (!exact) {
      return this.spendTry(playerId, card, "Wrong code.", "Wrong code. That card is now locked!");
    }
    card.redeemed = true;
    this.onRedeemed(playerId, {
      value: card.value,
      difficulty: card.difficulty,
      scenarioId: card.scenarioId,
    });
    return result(true, card.value, card.triesLeft, `Ka-ching! +$${card.value}`);
  }

  /** Tries to charge `amount` dollars to the Wobblebucks Card the player typed into the
   * Wobblebucks Machine. Within the card's hidden spending limit it pays that amount; over
   * it, the charge is declined and uses a try. */
  charge(playerId: string, input: string, amount: number): RedeemResult {
    const typed = normalizeCode(input);
    if (input.length > Config.Redeem.MaxCodeInputLength || !OnlyLettersAndDigits.test(typed)) {
      return result(false, 0, null, NotACode);
    }
    const { MinChargeAmount, MaxChargeAmount } = Config.Card;
    if (!Number.isInteger(amount) || amount < MinChargeAmount || amount > MaxChargeAmount) {
      return result(
        false,
        0,
        null,
        `Enter a whole amount from $${MinChargeAmount} to $${MaxChargeAmount}.`,
      );
    }
    // Neither of these costs a try: a gift card belongs in the Redeem app (where a near miss
    // would cost one of its tries), and anything else is pointed at the right prefix.
    if (!typed.startsWith(Config.Card.Prefix)) {
      return result(
        false,
        0,
        null,
        this.looksLikeOwnGiftCard(playerId, typed)
          ? GiftCardInMachine
          : `Wobblebucks Cards start with ${Config.Card.Prefix}.`,
      );
    }
    const match = this.findCard(playerId, typed, "wobblebucks");
    if (!match) {
      return result(false, 0, null, "No Wobblebucks Card matches that code.");
    }
    const { card, exact } = match;
    if (card.redeemed) {
      return result(false, 0, null, "You already charged this card.");
    }
    if (card.triesLeft <= 0) {
      return result(false, 0, 0, "This card is frozen. Too many tries.");
    }
    if (!exact) {
      return this.spendTry(
        playerId,
        card,
        "Unknown card.",
        "Unknown card. That card is now frozen!",
      );
    }
    if (amount > card.value) {
      // The limit stays hidden: too greedy just gets declined.
      return this.spendTry(
        playerId,
        card,
        "Declined! The card wobbled and said no.",
        "Declined! That card is now frozen.",
      );
    }
    card.redeemed = true;
    this.onCharged(playerId, amount, card.scenarioId);
    return result(true, amount, card.triesLeft, `Approved! Wobble-ka-ching! +$${amount}`);
  }

  /** True if the player has a card they can still cash in. */
  hasRedeemableCards(playerId: string): boolean {
    const cards = this.players.get(playerId)?.cards;
    return cards ? [...cards.values()].some(isRedeemable) : false;
  }

  /** Forgets a player's cards, e.g. when their shift ends or they leave. */
  clearCards(playerId: string): void {
    this.players.delete(playerId);
  }

  removeAll(): void {
    this.players.clear();
  }

  private register(
    playerId: string,
    code: string,
    card: Pick<IssuedCard, "kind" | "value" | "difficulty" | "scenarioId" | "triesLeft">,
  ): void {
    const player = this.getOrCreate(playerId);
    const key = normalizeCode(code);
    if (player.cards.has(key)) {
      return;
    }
    player.issued += 1;
    player.cards.set(key, { ...card, redeemed: false, order: player.issued });
  }

  /** Uses up one of `card`'s tries, locking it on the last one. */
  private spendTry(
    playerId: string,
    card: IssuedCard,
    problem: string,
    lockedMessage: string,
  ): RedeemResult {
    card.triesLeft -= 1;
    if (card.triesLeft === 0) {
      this.onLocked(playerId);
      return result(false, 0, 0, lockedMessage);
    }
    const tries = card.triesLeft === 1 ? "try" : "tries";
    return result(false, 0, card.triesLeft, `${problem} ${card.triesLeft} ${tries} left.`);
  }

  /** True if `typed` starts with the prefix of one of the player's gift cards, so it belongs
   * in the Redeem app rather than being a mistyped Wobblebucks Card. */
  private looksLikeOwnGiftCard(playerId: string, typed: string): boolean {
    const prefix = typed.slice(0, Config.Code.PrefixLength);
    const cards = this.players.get(playerId)?.cards;
    return cards
      ? [...cards].some(([code, card]) => card.kind === "giftCard" && code.startsWith(prefix))
      : false;
  }

  private getOrCreate(playerId: string): PlayerCards {
    let player = this.players.get(playerId);
    if (!player) {
      player = { cards: new Map(), issued: 0 };
      this.players.set(playerId, player);
    }
    return player;
  }

  /** The card of `kind` that `typed` was meant to be, and whether it matched exactly. A
   * wrong guess is matched to the closest card of that kind; ties go to one that can still
   * be used, then the newest. */
  private findCard(
    playerId: string,
    typed: string,
    kind: CardKind,
  ): { card: IssuedCard; exact: boolean } | null {
    const cards = this.players.get(playerId)?.cards;
    if (!cards) {
      return null;
    }
    const exact = cards.get(typed);
    if (exact?.kind === kind) {
      return { card: exact, exact: true };
    }
    let closest: IssuedCard | null = null;
    let closestDistance = Infinity;
    for (const [code, card] of cards) {
      if (card.kind !== kind) {
        continue;
      }
      const distance = editDistance(typed, code);
      if (
        !closest ||
        distance < closestDistance ||
        (distance === closestDistance && isBetterTie(card, closest))
      ) {
        closest = card;
        closestDistance = distance;
      }
    }
    return closest && { card: closest, exact: false };
  }
}
