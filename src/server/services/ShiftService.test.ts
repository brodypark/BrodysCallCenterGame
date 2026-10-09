import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import type { CallSnapshot, ShiftResult, ShiftSnapshot } from "@shared/types";
import { grandma } from "@server/scenarios/grandma";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import { CallService } from "@server/services/CallService";
import { RedeemService } from "@server/services/RedeemService";
import { ShiftService, type ShiftSummary } from "@server/services/ShiftService";
import { defaultStats, StatsService } from "@server/services/StatsService";

const PlayerId = "player-1";
// Short enough to step through, long enough to fit a call.
const ShiftSeconds = 120;

function advanceSeconds(seconds: number): void {
  vi.advanceTimersByTime(secondsToMs(seconds));
}

/** The services wired together the way the socket server does it. */
// Whether the test player has picked a save, so they may clock in.
let canPlay = true;

function createGame(quotaForLevel?: (level: number) => number): {
  shifts: ShiftService;
  calls: CallService;
  redeem: RedeemService;
  stats: StatsService;
  call: () => CallSnapshot;
  shift: () => ShiftSnapshot;
  results: ShiftResult[];
  // What onEnded was told, and how many shifts were failed in the saved stats by then.
  summaries: { summary: ShiftSummary; shiftsFailed: number }[];
} {
  const results: ShiftResult[] = [];
  const summaries: { summary: ShiftSummary; shiftsFailed: number }[] = [];
  let lastShift: ShiftSnapshot | null = null;
  const stats: StatsService = new StatsService({ send: () => undefined, save: () => undefined });
  const redeem = new RedeemService({
    onRedeemed: (playerId, card) => shifts.cardRedeemed(playerId, card),
    onLocked: (playerId) => shifts.cardLocked(playerId),
  });
  const calls = new CallService({
    scenarios: createScenarioRegistry([grandma]),
    codes: redeem,
    allowTestWords: true,
    statsOf: (playerId) => stats.get(playerId),
    send: () => undefined,
    random: () => 0,
    baitChance: 0,
  });
  const shifts = new ShiftService({
    calls,
    cards: redeem,
    stats,
    lengthSeconds: ShiftSeconds,
    canClockIn: () => canPlay,
    unlockedBetween: (from, to) => (from < 3 && to >= 3 ? ["Zorp the Alien"] : []),
    quotaForLevel,
    send: (_playerId, snapshot) => {
      lastShift = snapshot;
    },
    sendResult: (_playerId, result) => results.push(result),
    onEnded: (playerId, summary) =>
      summaries.push({ summary, shiftsFailed: stats.get(playerId).shiftsFailed }),
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
    summaries,
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
  canPlay = true;
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

describe("ShiftService: needing a save", () => {
  it("won't start a shift until a save is picked", () => {
    const game = createGame();
    canPlay = false;
    game.shifts.clockIn(PlayerId);
    expect(game.shift().status).toBe("offShift");
    advanceSeconds(Config.Call.FirstCallDelaySeconds * 4);
    expect(game.call().status).toBe("idle");
  });
});

describe("ShiftService: levels and perks", () => {
  it("reports a level up, and the callers it unlocks", () => {
    const game = createGame();
    game.stats.load(PlayerId, { ...defaultStats(), xp: 170 });
    clockInAndRing(game);
    answer(game);
    const code = getCode(game);
    game.calls.hangUp(PlayerId);
    game.redeem.redeem(PlayerId, code);
    advanceSeconds(ShiftSeconds);
    // 170 + 10 XP = 180: level 3 (175 XP).
    expect(game.results[0]).toMatchObject({ newLevel: 3, unlockedCallers: ["Zorp the Alien"] });
  });

  it("sets the quota from the player's level, and shows the next level's once they level up", () => {
    const game = createGame((level) => 100 * level);
    expect(game.shifts.snapshot(PlayerId).quota).toBe(100);
    game.stats.load(PlayerId, { ...defaultStats(), xp: 170 });
    expect(game.shifts.snapshot(PlayerId).quota).toBe(200);
    clockInAndRing(game);
    expect(game.shift().quota).toBe(200);
    expect(game.shifts.auditFailed(PlayerId, 25)).toBe(225);
    answer(game);
    const code = getCode(game);
    game.calls.hangUp(PlayerId);
    game.redeem.redeem(PlayerId, code);
    advanceSeconds(ShiftSeconds);
    // 180 XP is level 3; the report keeps the quota the shift had, audit raise included.
    expect(game.results[0]).toMatchObject({ newLevel: 3, quota: 225 });
    expect(game.shift()).toMatchObject({ status: "offShift", quota: 300 });
  });

  it("says nothing about levels when there wasn't one", () => {
    const game = createGame();
    game.shifts.clockIn(PlayerId);
    advanceSeconds(ShiftSeconds);
    expect(game.results[0]).toMatchObject({ newLevel: null, unlockedCallers: [] });
  });
});

describe("ShiftService: the end of a shift", () => {
  it("doesn't count a call still ringing when time runs out as ignored", () => {
    const game = createGame();
    clockInAndRing(game);
    // Shifts the rings so one is still ringing when the shift ends: they start at 10, 30,
    // 50, 70, 90 (each missed 15 s later) and 110 (cut off at 120).
    game.calls.decline(PlayerId);
    advanceSeconds(ShiftSeconds);
    expect(game.summaries[0]?.summary.endings).toEqual({ declined: 1, missed: 5 });
  });

  it("tells onEnded how the shift's calls ended, once the results are saved", () => {
    const game = createGame();
    clockInAndRing(game);
    answer(game);
    game.calls.hangUp(PlayerId);
    advanceSeconds(Config.Call.SecondsBetweenCalls);
    game.calls.decline(PlayerId);
    advanceSeconds(Config.Call.SecondsBetweenCalls + Config.Call.RingSeconds);
    advanceSeconds(ShiftSeconds);

    expect(game.summaries).toHaveLength(1);
    const [{ summary, shiftsFailed } = { summary: null, shiftsFailed: 0 }] = game.summaries;
    expect(summary).toMatchObject({
      result: { passed: false },
      levelBefore: 1,
      endings: { playerHungUp: 1, declined: 1, missed: expect.any(Number) as number },
    });
    expect(shiftsFailed).toBe(1);
  });

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
        // 55 XP: not yet level 2 (75).
        newLevel: null,
        unlockedCallers: [],
        auditsPassed: 0,
        auditsFailed: 0,
        hacked: false,
        fine: 0,
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

describe("ShiftService: clocking out early", () => {
  /** On shift with the quota met (three Grandma cards), the next call ringing. */
  function quotaMet(): Game {
    const game = createGame();
    clockInAndRing(game);
    for (let card = 0; card < 3; card++) {
      answer(game);
      const code = getCode(game);
      game.calls.hangUp(PlayerId);
      game.redeem.redeem(PlayerId, code);
      advanceSeconds(Config.Call.SecondsBetweenCalls);
    }
    return game;
  }

  it("does nothing below the quota", () => {
    const game = createGame();
    clockInAndRing(game);
    game.shifts.clockOut(PlayerId);
    expect(game.shift().status).toBe("onShift");
    expect(game.results).toHaveLength(0);
  });

  it("does nothing off shift", () => {
    const game = createGame();
    game.shifts.clockOut(PlayerId);
    expect(game.shift().status).toBe("offShift");
    expect(game.results).toHaveLength(0);
  });

  it("passes right away once the quota is met, a ringing call not counted as missed", () => {
    const game = quotaMet();
    expect(game.call().status).toBe("ringing");
    game.shifts.clockOut(PlayerId);
    expect(game.results[0]).toMatchObject({ passed: true, earnings: 150 });
    expect(game.summaries[0]?.summary.endings).toEqual({ playerHungUp: 3 });
    expect(game.shift().status).toBe("offShift");
    expect(game.call().status).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("opens the redeem window for a code still open between calls", () => {
    const game = quotaMet();
    answer(game);
    getCode(game);
    game.calls.hangUp(PlayerId);
    game.shifts.clockOut(PlayerId);
    expect(game.shift().status).toBe("overtime");
    expect(game.shift().overtimeEndsAt).toBe(
      Date.now() + secondsToMs(Config.Shift.OvertimeRedeemSeconds),
    );
    advanceSeconds(Config.Shift.OvertimeRedeemSeconds);
    expect(game.results[0]).toMatchObject({ passed: true, earnings: 150 });
  });

  it("lets a call in progress finish first, like overtime", () => {
    const game = quotaMet();
    answer(game);
    game.shifts.clockOut(PlayerId);
    expect(game.shift().status).toBe("overtime");
    expect(game.results).toHaveLength(0);
    const code = getCode(game);
    game.calls.hangUp(PlayerId);
    // The redeem window is open for the code.
    expect(game.shift().status).toBe("overtime");
    game.redeem.redeem(PlayerId, code);
    expect(game.results[0]).toMatchObject({ passed: true, earnings: 200 });
  });
});

describe("ShiftService: leaving mid-shift", () => {
  it("ends an abandoned shift as if time ran out, keeping the XP", () => {
    const game = createGame();
    clockInAndRing(game);
    answer(game);
    const code = getCode(game);
    game.redeem.redeem(PlayerId, code);
    game.shifts.abandon(PlayerId);
    expect(game.results[0]).toMatchObject({ passed: false, earnings: 50, xpEarned: 10 });
    expect(game.stats.get(PlayerId)).toMatchObject({ money: 0, xp: 10, shiftsFailed: 1 });
    expect(game.shift().status).toBe("offShift");
  });

  it("does nothing for a player who isn't on shift", () => {
    const game = createGame();
    game.shifts.abandon(PlayerId);
    expect(game.results).toHaveLength(0);
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

describe("ShiftService: Skibidi's audits", () => {
  it("adds a passed audit's bonus to the earnings and XP, and counts it", () => {
    const game = createGame();
    clockInAndRing(game);
    game.shifts.auditPassed(PlayerId, 25, 20);
    expect(game.shift().earnings).toBe(25);
    advanceSeconds(ShiftSeconds);
    expect(game.results[0]).toMatchObject({ earnings: 25, auditsPassed: 1, auditsFailed: 0 });
    expect(game.results[0]?.xpEarned).toBe(20);
  });

  it("raises this shift's quota for a failed audit, then goes back to normal", () => {
    const game = createGame();
    clockInAndRing(game);
    expect(game.shifts.auditFailed(PlayerId, 25)).toBe(Config.Shift.Quota + 25);
    expect(game.shift().quota).toBe(Config.Shift.Quota + 25);
    advanceSeconds(ShiftSeconds);
    expect(game.results[0]).toMatchObject({ quota: Config.Shift.Quota + 25, auditsFailed: 1 });
    expect(game.shift().quota).toBe(Config.Shift.Quota);
  });

  it("won't clock out early until the raised quota is met", () => {
    const game = createGame();
    clockInAndRing(game);
    game.shifts.auditFailed(PlayerId, 25);
    game.shifts.auditPassed(PlayerId, Config.Shift.Quota, 0);
    game.shifts.clockOut(PlayerId);
    expect(game.shift().status).toBe("onShift");
    game.shifts.auditPassed(PlayerId, 25, 0);
    game.shifts.clockOut(PlayerId);
    expect(game.results[0]?.passed).toBe(true);
  });

  it("only takes audits before the timer runs out", () => {
    const game = createGame();
    expect(game.shifts.claimAudit(PlayerId, true)).toBe(false);
    expect(game.shifts.auditFailed(PlayerId, 25)).toBeNull();
    clockInAndRing(game);
    expect(game.shifts.claimAudit(PlayerId, false)).toBe(true);
    game.calls.answer(PlayerId);
    advanceSeconds(ShiftSeconds);
    expect(game.shift().status).toBe("overtime");
    expect(game.shifts.claimAudit(PlayerId, true)).toBe(false);
  });
});

describe("ShiftService: getting hacked", () => {
  it("fails the shift on the spot, whatever it earned, and fines the bank", () => {
    const game = createGame();
    game.stats.load(PlayerId, { ...defaultStats(), money: 1000 });
    game.shifts.clockIn(PlayerId);
    game.shifts.cardCharged(PlayerId, Config.Shift.Quota);

    const announced: number[] = [];
    expect(
      game.shifts.hacked(PlayerId, 300, (fine) => {
        announced.push(fine);
        // Told before the report goes out.
        expect(game.results).toEqual([]);
      }),
    ).toBe(true);
    expect(announced).toEqual([300]);
    expect(game.shifts.isOnShift(PlayerId)).toBe(false);
    expect(game.results[0]).toMatchObject({
      passed: false,
      hacked: true,
      fine: 300,
      earnings: Config.Shift.Quota,
    });
    expect(game.stats.get(PlayerId)).toMatchObject({ money: 700, shiftsFailed: 1 });
  });

  it("never fines the bank below zero", () => {
    const game = createGame();
    game.stats.load(PlayerId, { ...defaultStats(), money: 120 });
    game.shifts.clockIn(PlayerId);
    const announced: number[] = [];
    game.shifts.hacked(PlayerId, 300, (fine) => announced.push(fine));
    expect(announced).toEqual([120]);
    expect(game.results[0]).toMatchObject({ fine: 120 });
    expect(game.stats.get(PlayerId).money).toBe(0);
  });

  it("ends the call in progress", () => {
    const game = createGame();
    clockInAndRing(game);
    answer(game);
    game.shifts.hacked(PlayerId, 300, () => undefined);
    expect(game.call().status).toBe("idle");
  });

  it("does nothing off shift", () => {
    const game = createGame();
    const announced: number[] = [];
    expect(game.shifts.hacked(PlayerId, 300, (fine) => announced.push(fine))).toBe(false);
    expect(announced).toEqual([]);
    expect(game.results).toEqual([]);
  });
});
