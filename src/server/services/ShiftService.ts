// Runs each player's shifts: clocking in, the timer, overtime and the results. Ported from
// the Roblox ShiftService.
//
// Clocking in starts the timer and turns calls on. When it runs out, no new calls ring (a
// ringing one counts as missed). A call in progress can finish: that's overtime. In an
// overtime call the player has Config.Shift.OvertimeIdleSeconds to say something on their
// turn (the countdown pauses while the victim thinks and talks), or the call is cut off.
// Once the call is over, a player still holding a code gets OvertimeRedeemSeconds to cash
// it in. Then the shift ends: passing banks the shift's earnings, failing loses them, and
// XP is kept either way.

import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import type {
  CallEndReason,
  Difficulty,
  ShiftResult,
  ShiftSnapshot,
  ShiftStatus,
} from "@shared/types";
import { levelOf } from "@shared/Levels";
import { extraShiftSeconds } from "@shared/Upgrades";
import type { StatsService } from "@server/services/StatsService";

// Calls that were answered, so they count as calls taken.
const AnsweredReasons: ReadonlySet<CallEndReason> = new Set([
  "playerHungUp",
  "victimHungUp",
  "shiftEnded",
]);

/** What the shift needs from the calls. */
export interface ShiftCalls {
  startCalls: (playerId: string) => void;
  stopCalls: (playerId: string) => void;
  forceHangUp: (playerId: string, reason: CallEndReason) => boolean;
  isInCall: (playerId: string) => boolean;
  isPlayerTurn: (playerId: string) => boolean;
}

/** What the shift needs from the cards. */
export interface ShiftCards {
  hasRedeemableCards: (playerId: string) => boolean;
  clearCards: (playerId: string) => void;
}

export interface ShiftServiceOptions {
  calls: ShiftCalls;
  cards: ShiftCards;
  stats: StatsService;
  // Sends a player their latest shift snapshot. Called after every change.
  send: (playerId: string, snapshot: ShiftSnapshot) => void;
  // Sends a player their report card when a shift ends.
  sendResult: (playerId: string, result: ShiftResult) => void;
  // Overrides Config.Shift.LengthSeconds (development only, for testing).
  lengthSeconds?: number;
  // Whether the player may start a shift at all (they've picked a save).
  canClockIn: (playerId: string) => boolean;
  // Names of the callers that unlock between two levels, for the report.
  unlockedBetween: (fromLevel: number, toLevel: number) => string[];
}

interface PlayerShift {
  status: ShiftStatus;
  endsAt: number | null;
  overtimeEndsAt: number | null;
  // True once the overtime redeem window has opened (the last call is over).
  redeemWindowOpen: boolean;
  earnings: number;
  xpEarned: number;
  callsTaken: number;
  successfulCalls: number;
  // The last shift's report, kept until the player closes it, so one that ends while they're
  // reconnecting isn't lost.
  unseenResult: ShiftResult | null;
  // The pending timer: the shift timer, the overtime idle timer or the redeem window.
  timer: ReturnType<typeof setTimeout> | null;
}

function newShift(): PlayerShift {
  return {
    status: "offShift",
    endsAt: null,
    overtimeEndsAt: null,
    redeemWindowOpen: false,
    earnings: 0,
    xpEarned: 0,
    callsTaken: 0,
    successfulCalls: 0,
    unseenResult: null,
    timer: null,
  };
}

export class ShiftService {
  private readonly shifts = new Map<string, PlayerShift>();
  private readonly options: ShiftServiceOptions;

  constructor(options: ShiftServiceOptions) {
    this.options = options;
  }

  snapshot(playerId: string): ShiftSnapshot {
    return this.makeSnapshot(playerId, this.shifts.get(playerId) ?? newShift());
  }

  /** The last shift's report if the player hasn't closed it yet, e.g. to send again after a
   * reconnect. */
  unseenResult(playerId: string): ShiftResult | null {
    return this.shifts.get(playerId)?.unseenResult ?? null;
  }

  /** The player closed the shift report. */
  resultSeen(playerId: string): void {
    const shift = this.shifts.get(playerId);
    if (shift) {
      shift.unseenResult = null;
    }
  }

  isOnShift(playerId: string): boolean {
    return (this.shifts.get(playerId)?.status ?? "offShift") !== "offShift";
  }

  /** Starts a shift. Only while off shift, and once a save is picked. */
  clockIn(playerId: string): void {
    const existing = this.shifts.get(playerId);
    if ((existing && existing.status !== "offShift") || !this.options.canClockIn(playerId)) {
      return;
    }
    const shift = newShift();
    this.shifts.set(playerId, shift);
    const lengthSeconds = this.lengthSeconds(playerId);
    shift.status = "onShift";
    shift.endsAt = Date.now() + secondsToMs(lengthSeconds);
    this.startTimer(shift, lengthSeconds, () => this.timeUp(playerId, shift));
    this.options.calls.startCalls(playerId);
    this.publish(playerId, shift);
  }

  /** A call ended. Counts answered ones, and in overtime checks whether the shift is done. */
  callEnded(playerId: string, reason: CallEndReason): void {
    const shift = this.shifts.get(playerId);
    if (!shift || shift.status === "offShift") {
      return;
    }
    if (AnsweredReasons.has(reason)) {
      shift.callsTaken += 1;
    }
    this.checkOvertime(playerId, shift);
  }

  /** Whose turn it is changed: in an overtime call, the idle countdown runs only on the
   * player's turn. */
  turnChanged(playerId: string): void {
    const shift = this.shifts.get(playerId);
    if (shift) {
      this.updateIdleTimer(playerId, shift);
    }
  }

  /** A gift card was cashed in: its value goes into this shift's earnings. */
  cardRedeemed(playerId: string, card: { value: number; difficulty: Difficulty }): void {
    const shift = this.shifts.get(playerId);
    // Cards are cleared when a shift ends, so this only happens on shift.
    if (!shift || shift.status === "offShift") {
      return;
    }
    shift.earnings += card.value;
    shift.successfulCalls += 1;
    shift.xpEarned += Config.XP.PerSuccess[card.difficulty];
    this.publish(playerId, shift);
    // After the earnings are added, so a shift that ends here counts this card.
    this.checkOvertime(playerId, shift);
  }

  /** A card ran out of tries: in overtime, that may be the last thing left to finish. */
  cardLocked(playerId: string): void {
    const shift = this.shifts.get(playerId);
    if (shift) {
      this.checkOvertime(playerId, shift);
    }
  }

  /** The player left for good mid-shift: the shift ends as if time ran out, so its results
   * (a fail if under quota, XP kept) are saved. Leaving can't dodge a FIRED. */
  abandon(playerId: string): void {
    const shift = this.shifts.get(playerId);
    if (shift && shift.status !== "offShift") {
      this.endShift(playerId, shift);
    }
  }

  /** Forgets a player's shift (no results), cancelling its timers. */
  removePlayer(playerId: string): void {
    const shift = this.shifts.get(playerId);
    if (shift) {
      this.cancelTimer(shift);
      this.shifts.delete(playerId);
    }
  }

  removeAll(): void {
    for (const playerId of [...this.shifts.keys()]) {
      this.removePlayer(playerId);
    }
  }

  private timeUp(playerId: string, shift: PlayerShift): void {
    if (shift.status !== "onShift") {
      return;
    }
    this.options.calls.stopCalls(playerId);
    shift.status = "overtime";
    shift.redeemWindowOpen = false;
    shift.overtimeEndsAt = null;
    if (this.options.calls.isInCall(playerId)) {
      this.updateIdleTimer(playerId, shift);
    } else {
      // No snapshot first: checkOvertime sends one either way (the redeem window opening,
      // or the shift ending).
      this.checkOvertime(playerId, shift);
    }
  }

  /** In overtime: ends the shift once there's nothing left to finish. While a call is going
   * it waits for it; after that it gives the player a short window to redeem any code. */
  private checkOvertime(playerId: string, shift: PlayerShift): void {
    if (shift.status !== "overtime" || this.options.calls.isInCall(playerId)) {
      return;
    }
    if (!this.options.cards.hasRedeemableCards(playerId)) {
      this.endShift(playerId, shift);
      return;
    }
    if (!shift.redeemWindowOpen) {
      shift.redeemWindowOpen = true;
      const seconds = Config.Shift.OvertimeRedeemSeconds;
      shift.overtimeEndsAt = Date.now() + secondsToMs(seconds);
      // Replaces the idle timer: the call is over.
      this.startTimer(shift, seconds, () => this.endShift(playerId, shift));
      this.publish(playerId, shift);
    }
  }

  /** In an overtime call, the player has Config.Shift.OvertimeIdleSeconds to say something on
   * their turn. Running out only cuts the call off; callEnded then opens the redeem window as
   * usual, so a code the victim already read out isn't lost. */
  private updateIdleTimer(playerId: string, shift: PlayerShift): void {
    if (shift.status !== "overtime" || shift.redeemWindowOpen) {
      return;
    }
    if (this.options.calls.isPlayerTurn(playerId)) {
      const seconds = Config.Shift.OvertimeIdleSeconds;
      shift.overtimeEndsAt = Date.now() + secondsToMs(seconds);
      this.startTimer(shift, seconds, () => {
        if (shift.status === "overtime") {
          this.options.calls.forceHangUp(playerId, "shiftEnded");
        }
      });
    } else {
      this.cancelTimer(shift);
      shift.overtimeEndsAt = null;
    }
    this.publish(playerId, shift);
  }

  private endShift(playerId: string, shift: PlayerShift): void {
    if (shift.status === "offShift") {
      return;
    }
    // Off shift before anything else, so anything that runs during stopCalls (e.g. a ringing
    // call ending) sees the shift as over.
    shift.status = "offShift";
    this.cancelTimer(shift);
    this.options.calls.stopCalls(playerId);
    // A safety net: overtime always waits for the call, so there shouldn't be one.
    if (this.options.calls.forceHangUp(playerId, "shiftEnded")) {
      shift.callsTaken += 1;
    }
    this.options.cards.clearCards(playerId);

    const quota = Config.Shift.Quota;
    const passed = shift.earnings >= quota;
    const xpEarned = shift.xpEarned + (passed ? Config.XP.ShiftPassBonus : 0);
    const before = this.options.stats.get(playerId);
    const levelBefore = levelOf(before.xp);
    const levelAfter = levelOf(before.xp + xpEarned);
    const result: ShiftResult = {
      passed,
      earnings: shift.earnings,
      quota,
      callsTaken: shift.callsTaken,
      successfulCalls: shift.successfulCalls,
      xpEarned,
      newLevel: levelAfter > levelBefore ? levelAfter : null,
      unlockedCallers: this.options.unlockedBetween(levelBefore, levelAfter),
    };
    // Passing banks the earnings; failing loses them. XP is kept either way.
    this.options.stats.update(playerId, (stats) => {
      if (passed) {
        stats.money += result.earnings;
        stats.shiftsPassed += 1;
      } else {
        stats.shiftsFailed += 1;
      }
      stats.xp += result.xpEarned;
      stats.callsCompleted += result.callsTaken;
      stats.successfulCalls += result.successfulCalls;
    });

    shift.endsAt = null;
    shift.overtimeEndsAt = null;
    shift.earnings = 0;
    shift.unseenResult = result;
    this.options.sendResult(playerId, result);
    this.publish(playerId, shift);
  }

  /** How long the player's shifts last: the dev override, or Config plus Extra Coffee. */
  private lengthSeconds(playerId: string): number {
    return (
      this.options.lengthSeconds ??
      Config.Shift.LengthSeconds + extraShiftSeconds(this.options.stats.get(playerId))
    );
  }

  private startTimer(shift: PlayerShift, seconds: number, callback: () => void): void {
    this.cancelTimer(shift);
    shift.timer = setTimeout(() => {
      shift.timer = null;
      callback();
    }, secondsToMs(seconds));
  }

  private cancelTimer(shift: PlayerShift): void {
    if (shift.timer !== null) {
      clearTimeout(shift.timer);
      shift.timer = null;
    }
  }

  private makeSnapshot(playerId: string, shift: PlayerShift): ShiftSnapshot {
    return {
      status: shift.status,
      earnings: shift.earnings,
      quota: Config.Shift.Quota,
      lengthSeconds: this.lengthSeconds(playerId),
      endsAt: shift.endsAt,
      overtimeEndsAt: shift.overtimeEndsAt,
      serverNow: Date.now(),
    };
  }

  private publish(playerId: string, shift: PlayerShift): void {
    this.options.send(playerId, this.makeSnapshot(playerId, shift));
  }
}
