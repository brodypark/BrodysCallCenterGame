// Keeps each player's revealed card codes and cashes them in when typed into the Redeem
// app. Ported from the Roblox RedeemService. It holds no money: onRedeemed is told when a
// card is cashed in, and pays.
//
// Codes are stored normalized (capitals, no spaces or dashes), so "gma 7qz" matches
// GMA-7QZ. A wrong guess is matched to the closest card and costs one of its tries; after
// Config.Redeem.TriesPerCode wrong tries the card locks. Wobblebucks Cards (step 12) start
// with Config.Card.Prefix and are turned away here without costing a try.

import { normalizeCode } from "@shared/cardCode";
import { Config } from "@shared/Config";
import type { Difficulty, RedeemResult } from "@shared/types";
import { generateCode } from "@server/services/codes";

interface IssuedCard {
  // Paid out when it's redeemed.
  value: number;
  // The scenario's difficulty, which sets the XP for cashing it in.
  difficulty: Difficulty;
  // Wrong tries left before the card locks. 0 means locked.
  triesLeft: number;
  // Cashed in. Each card pays out once.
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
  // A card was cashed in.
  onRedeemed: (playerId: string, card: { value: number; difficulty: Difficulty }) => void;
  // A card ran out of tries and can't be cashed in any more.
  onLocked?: (playerId: string) => void;
  // Extra wrong tries per card for this player (the Sticky Notes perk).
  extraTries?: (playerId: string) => number;
}

const NotACode = "That doesn't look like a card code.";
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
  private readonly onLocked: NonNullable<RedeemServiceOptions["onLocked"]>;
  private readonly extraTries: NonNullable<RedeemServiceOptions["extraTries"]>;

  constructor(options: RedeemServiceOptions) {
    this.onRedeemed = options.onRedeemed;
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
  registerGiftCard(
    playerId: string,
    code: string,
    card: { value: number; difficulty: Difficulty },
  ): void {
    const player = this.getOrCreate(playerId);
    const key = normalizeCode(code);
    if (player.cards.has(key)) {
      return;
    }
    player.issued += 1;
    player.cards.set(key, {
      value: card.value,
      difficulty: card.difficulty,
      triesLeft: Config.Redeem.TriesPerCode + this.extraTries(playerId),
      redeemed: false,
      order: player.issued,
    });
  }

  /** Tries to cash in what the player typed into the Redeem app. */
  redeem(playerId: string, input: string): RedeemResult {
    const typed = normalizeCode(input);
    if (input.length > Config.Redeem.MaxCodeInputLength || !OnlyLettersAndDigits.test(typed)) {
      return result(false, 0, null, NotACode);
    }
    if (typed.startsWith(Config.Card.Prefix)) {
      return result(
        false,
        0,
        null,
        "That's a Wobblebucks Card. Charge it in the Wobblebucks Machine.",
      );
    }
    const match = this.findCard(playerId, typed);
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
      card.triesLeft -= 1;
      if (card.triesLeft === 0) {
        this.onLocked(playerId);
        return result(false, 0, 0, "Wrong code. That card is now locked!");
      }
      const tries = card.triesLeft === 1 ? "try" : "tries";
      return result(false, 0, card.triesLeft, `Wrong code. ${card.triesLeft} ${tries} left.`);
    }
    card.redeemed = true;
    this.onRedeemed(playerId, { value: card.value, difficulty: card.difficulty });
    return result(true, card.value, card.triesLeft, `Ka-ching! +$${card.value}`);
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

  private getOrCreate(playerId: string): PlayerCards {
    let player = this.players.get(playerId);
    if (!player) {
      player = { cards: new Map(), issued: 0 };
      this.players.set(playerId, player);
    }
    return player;
  }

  /** The card `typed` was meant to be, and whether it matched exactly. A wrong guess is
   * matched to the closest card; ties go to one that can still be used, then the newest. */
  private findCard(playerId: string, typed: string): { card: IssuedCard; exact: boolean } | null {
    const cards = this.players.get(playerId)?.cards;
    if (!cards) {
      return null;
    }
    const exact = cards.get(typed);
    if (exact) {
      return { card: exact, exact: true };
    }
    let closest: IssuedCard | null = null;
    let closestDistance = Infinity;
    for (const [code, card] of cards) {
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
