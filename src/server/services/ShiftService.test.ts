import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import type { CallSnapshot, ShiftResult, ShiftSnapshot } from "@shared/types";
import { grandma } from "@server/scenarios/grandma";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import { CallService } from "@server/services/CallService";
import { RedeemService } from "@server/services/RedeemService";
import { ShiftService } from "@server/services/ShiftService";
import { StatsService } from "@server/services/StatsService";

const PlayerId = "player-1";
// Short enough to step through, long enough to fit a call.
const ShiftSeconds = 120;

function advanceSeconds(seconds: number): void {
  vi.advanceTimersByTime(secondsToMs(seconds));
}

/** The services wired together the way the socket server does it. */
function createGame(): {
  shifts: ShiftService;
  calls: CallService;
  redeem: RedeemService;
  stats: StatsService;
  call: () => CallSnapshot;
  shift: () => ShiftSnapshot;
  results: ShiftResult[];
} {
  const results: ShiftResult[] = [];
  let lastShift: ShiftSnapshot | null = null;
  const stats = new StatsService({ send: () => undefined });
  const redeem = new RedeemService({
    onRedeemed: (playerId, card) => shifts.cardRedeemed(playerId, card),
    onLocked: (playerId) => shifts.cardLocked(playerId),
  });
  const calls = new CallService({
    scenarios: createScenarioRegistry([grandma]),
    codes: redeem,
    allowTestWords: true,
    send: () => undefined,
    random: () => 0,
  });
  const shifts = new ShiftService({
    calls,
    cards: redeem,
    stats,
    lengthSeconds: ShiftSeconds,
    send: (_playerId, snapshot) => {
      lastShift = snapshot;
    },
    sendResult: (_playerId, result) => results.push(result),
  });
  calls.setListener({
    callEnded: (playerId, reason) => shifts.callEnded(playerId, reason),
    turnChanged: (playerId) => shifts.turnChanged(playerId),
  });
  calls.addPlayer(PlayerId);
  return {
    shifts,
    calls,
    redeem,
    stats,
    results,
    call: () => calls.snapshot(PlayerId) as CallSnapshot,
    shift: () => lastShift ?? shifts.snapshot(PlayerId),
  };
}

type Game = ReturnType<typeof createGame>;

function lastLineId(game: Game): number {
  const line = game.call().transcript?.messages.findLast((message) => message.speaker === "victim");
  return line?.speaker === "victim" ? line.lineId : -1;
}

/** The victim finishes the line they're saying. */
function finishLine(game: Game): void {
  advanceSeconds(Config.Turn.MinSpeakingSeconds);
  game.calls.finishedSpeaking(PlayerId, lastLineId(game));
}

/** Answers the ringing call and waits for the player's turn. */
function answer(game: Game): void {
  game.calls.answer(PlayerId);
  finishLine(game);
}

function say(game: Game, text: string): void {
  game.calls.sendMessage(PlayerId, text);
  advanceSeconds(Config.Turn.ThinkingSeconds);
  finishLine(game);
}

/** Gets Grandma's code out with the test word and returns it. */
function getCode(game: Game): string {
  say(game, "!reveal");
  const text = game.call().transcript?.messages.at(-1)?.text ?? "";
  return /GMA-[A-Z0-9]{3}/.exec(text)?.[0] ?? "";
}

/** Clocks in and waits for the first call to ring. */
function clockInAndRing(game: Game): void {
  game.shifts.clockIn(PlayerId);
  advanceSeconds(Config.Call.FirstCallDelaySeconds);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ShiftService: clocking in", () => {
  it("starts the timer and turns calls on, only while off shift", () => {
    const game = createGame();
    advanceSeconds(Config.Call.FirstCallDelaySeconds * 4);
    expect(game.call().status).toBe("idle");

    clockInAndRing(game);
    expect(game.shift()).toMatchObject({ status: "onShift", earnings: 0 });
    expect(game.shift().endsAt).toBe(
      Date.now() + secondsToMs(ShiftSeconds - Config.Call.FirstCallDelaySeconds),
    );
    expect(game.shift().lengthSeconds).toBe(ShiftSeconds);
    expect(game.call().status).toBe("ringing");

    const endsAt = game.shift().endsAt;
    game.shifts.clockIn(PlayerId);
    expect(game.shift().endsAt).toBe(endsAt);
  });
});

describe("ShiftService: the end of a shift", () => {
  it("passes when earnings reach the quota: banked, with the pass bonus", () => {
    const game = createGame();
    clockInAndRing(game);
    // Three Grandma cards make the $150 quota.
    for (let card = 0; card < 3; card++) {
      answer(game);
      const code = getCode(game);
      game.calls.hangUp(PlayerId);
      game.redeem.redeem(PlayerId, code);
      advanceSeconds(Config.Call.SecondsBetweenCalls);
    }
    expect(game.shift().earnings).toBe(150);
    game.calls.decline(PlayerId);
    advanceSeconds(ShiftSeconds);

    expect(game.results).toEqual([
      {
        passed: true,
        earnings: 150,
        quota: Config.Shift.Quota,
        callsTaken: 3,
        successfulCalls: 3,
        xpEarned: 3 * Config.XP.PerSuccess.Easy + Config.XP.ShiftPassBonus,
      },
    ]);
    expect(game.stats.get(PlayerId)).toMatchObject({
      money: 150,
      xp: 3 * Config.XP.PerSuccess.Easy + Config.XP.ShiftPassBonus,
      callsCompleted: 3,
      successfulCalls: 3,
      shiftsPassed: 1,
      shiftsFailed: 0,
    });
    expect(game.shift()).toMatchObject({ status: "offShift", earnings: 0, endsAt: null });
  });

  it("fails below the quota: earnings lost, XP kept", () => {
    const game = createGame();
    clockInAndRing(game);
    answer(game);
    const code = getCode(game);
    game.calls.hangUp(PlayerId);
    game.redeem.redeem(PlayerId, code);
    advanceSeconds(ShiftSeconds);

    expect(game.results[0]).toMatchObject({
      passed: false,
      earnings: 50,
      xpEarned: Config.XP.PerSuccess.Easy,
    });
    expect(game.stats.get(PlayerId)).toMatchObject({ money: 0, xp: 10, shiftsFailed: 1 });
  });

  it("ends right on time when nothing is going on, and rings no more calls", () => {
    const game = createGame();
    game.shifts.clockIn(PlayerId);
    vi.advanceTimersByTime(secondsToMs(ShiftSeconds) - 1);
    expect(game.results).toHaveLength(0);
    // Whatever is ringing at the end counts as missed.
    vi.advanceTimersByTime(1);
    expect(game.results).toHaveLength(1);
    expect(game.call().status).toBe("idle");
    advanceSeconds(Config.Call.SecondsBetweenCalls * 10);
    expect(game.call().status).toBe("idle");
  });

  it("clears codes nobody redeemed when the shift ends", () => {
    const game = createGame();
    clockInAndRing(game);
    answer(game);
    getCode(game);
    game.calls.hangUp(PlayerId);
    // Time runs out with a code still open: the redeem window, then the end.
    advanceSeconds(ShiftSeconds + Config.Shift.OvertimeRedeemSeconds);
    expect(game.results).toHaveLength(1);
    expect(game.redeem.hasRedeemableCards(PlayerId)).toBe(false);
  });
});

describe("ShiftService: overtime", () => {
  /** On shift, in a call when the timer runs out. */
  function inOvertimeCall(): Game {
    const game = createGame();
    game.shifts.clockIn(PlayerId);
    // Answer the first call, then wait on the player's turn until time's up.
    advanceSeconds(Config.Call.FirstCallDelaySeconds);
    answer(game);
    const left = (game.shift().endsAt ?? 0) - Date.now();
    vi.advanceTimersByTime(left);
    return game;
  }

  it("lets the call in progress finish", () => {
    const game = inOvertimeCall();
    expect(game.shift().status).toBe("overtime");
    expect(game.call().status).toBe("inCall");
    expect(game.results).toHaveLength(0);
  });

  it("cuts the call off after the idle time on the player's turn, then ends", () => {
    const game = inOvertimeCall();
    expect(game.shift().overtimeEndsAt).toBe(
      Date.now() + secondsToMs(Config.Shift.OvertimeIdleSeconds),
    );
    vi.advanceTimersByTime(secondsToMs(Config.Shift.OvertimeIdleSeconds) - 1);
    expect(game.call().status).toBe("inCall");
    vi.advanceTimersByTime(1);
    expect(game.call().lastOutcome).toBe("shiftEnded");
    expect(game.results[0]).toMatchObject({ callsTaken: 1 });
  });

  it("pauses the idle countdown while the victim thinks and talks", () => {
    const game = inOvertimeCall();
    advanceSeconds(Config.Shift.OvertimeIdleSeconds - 1);
    game.calls.sendMessage(PlayerId, "still here!");
    expect(game.shift().overtimeEndsAt).toBeNull();
    advanceSeconds(Config.Turn.ThinkingSeconds);
    finishLine(game);
    // A fresh countdown on the player's next turn.
    expect(game.shift().overtimeEndsAt).toBe(
      Date.now() + secondsToMs(Config.Shift.OvertimeIdleSeconds),
    );
    expect(game.call().status).toBe("inCall");
  });

  it("gives a short window to redeem a code still open after the last call", () => {
    const game = inOvertimeCall();
    const code = getCode(game);
    game.calls.hangUp(PlayerId);
    expect(game.shift().overtimeEndsAt).toBe(
      Date.now() + secondsToMs(Config.Shift.OvertimeRedeemSeconds),
    );
    expect(game.results).toHaveLength(0);

    // Redeeming the last code ends the shift straight away.
    game.redeem.redeem(PlayerId, code);
    expect(game.results[0]).toMatchObject({ earnings: 50, successfulCalls: 1 });
  });

  it("ends when the redeem window runs out", () => {
    const game = inOvertimeCall();
    getCode(game);
    game.calls.hangUp(PlayerId);
    vi.advanceTimersByTime(secondsToMs(Config.Shift.OvertimeRedeemSeconds) - 1);
    expect(game.results).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(game.results).toHaveLength(1);
  });

  it("ends as soon as the last open code locks", () => {
    const game = inOvertimeCall();
    getCode(game);
    game.calls.hangUp(PlayerId);
    for (let tries = 0; tries < Config.Redeem.TriesPerCode; tries++) {
      game.redeem.redeem(PlayerId, "GMA-ZZZ");
    }
    expect(game.results).toHaveLength(1);
  });

  it("opens the redeem window after cutting off a call where the code was read out", () => {
    const game = inOvertimeCall();
    getCode(game);
    advanceSeconds(Config.Shift.OvertimeIdleSeconds);
    expect(game.call().lastOutcome).toBe("shiftEnded");
    expect(game.results).toHaveLength(0);
    expect(game.shift().overtimeEndsAt).toBe(
      Date.now() + secondsToMs(Config.Shift.OvertimeRedeemSeconds),
    );
  });

  it("doesn't end the shift for a card redeemed while the call is still going", () => {
    const game = inOvertimeCall();
    const code = getCode(game);
    game.redeem.redeem(PlayerId, code);
    expect(game.results).toHaveLength(0);
    expect(game.call().status).toBe("inCall");
    game.calls.hangUp(PlayerId);
    expect(game.results[0]).toMatchObject({ earnings: 50 });
  });

  it("keeps the report until the player has seen it", () => {
    const game = inOvertimeCall();
    game.calls.hangUp(PlayerId);
    expect(game.shifts.unseenResult(PlayerId)).toEqual(game.results[0]);
    game.shifts.resultSeen(PlayerId);
    expect(game.shifts.unseenResult(PlayerId)).toBeNull();
  });

  it("ends right after the call when there's no code to redeem", () => {
    const game = inOvertimeCall();
    game.calls.hangUp(PlayerId);
    expect(game.results).toHaveLength(1);
    expect(game.shift().status).toBe("offShift");
  });
});

describe("ShiftService: cleanup", () => {
  it("cancels the shift's timers when the player leaves", () => {
    const game = createGame();
    game.shifts.clockIn(PlayerId);
    game.shifts.removePlayer(PlayerId);
    game.calls.removePlayer(PlayerId);
    expect(vi.getTimerCount()).toBe(0);
    advanceSeconds(ShiftSeconds * 2);
    expect(game.results).toHaveLength(0);
  });
});
