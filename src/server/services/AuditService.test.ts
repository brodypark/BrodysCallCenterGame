import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Config } from "@shared/Config";
import type { GameMode } from "@shared/sandbox";
import { secondsToMs } from "@shared/time";
import type { AuditSnapshot, CallSnapshot, ShiftResult, ShiftSnapshot } from "@shared/types";
import { ServerConfig } from "@server/config";
import { grandma } from "@server/scenarios/grandma";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import { AuditService } from "@server/services/AuditService";
import { CallService } from "@server/services/CallService";
import type { MailDraft } from "@server/services/MailService";
import { RedeemService } from "@server/services/RedeemService";
import { ShiftService } from "@server/services/ShiftService";
import { StatsService } from "@server/services/StatsService";

const PlayerId = "player-1";
const ShiftSeconds = 300;
const { Phrase, PassMoney, PassXP, FailQuotaRaise, AfterPlayerTurn } = ServerConfig.Audit;

// What the audits' random rolls return (0 always starts one).
let roll = 0;
let mode: GameMode | null = "campaign";

function advanceSeconds(seconds: number): void {
  vi.advanceTimersByTime(secondsToMs(seconds));
}

/** The services wired together the way the socket server does it. */
function createGame(): {
  shifts: ShiftService;
  calls: CallService;
  audits: AuditService;
  mail: MailDraft[];
  results: ShiftResult[];
  audit: () => AuditSnapshot | null;
  call: () => CallSnapshot;
  shift: () => ShiftSnapshot;
} {
  const mail: MailDraft[] = [];
  const results: ShiftResult[] = [];
  let lastAudit: AuditSnapshot | null = null;
  const stats = new StatsService({ send: () => undefined, save: () => undefined });
  const redeem = new RedeemService({
    onRedeemed: (playerId, card) => shifts.cardRedeemed(playerId, card),
  });
  const calls = new CallService({
    scenarios: createScenarioRegistry([grandma]),
    codes: redeem,
    allowTestWords: true,
    statsOf: (playerId) => stats.get(playerId),
    send: () => undefined,
    // Grandma always has her side problem.
    random: () => 0,
  });
  const shifts: ShiftService = new ShiftService({
    calls,
    cards: redeem,
    stats,
    lengthSeconds: ShiftSeconds,
    canClockIn: () => true,
    unlockedBetween: () => [],
    send: () => undefined,
    sendResult: (_playerId, result) => results.push(result),
  });
  const audits = new AuditService({
    callProgress: (playerId) => calls.progress(playerId),
    modeOf: () => mode,
    shift: shifts,
    mail: (_playerId, draft) => mail.push(draft),
    send: (_playerId, snapshot) => {
      lastAudit = snapshot;
    },
    random: () => roll,
  });
  calls.setListener({
    callEnded: (playerId, reason) => {
      audits.callEnded(playerId, reason);
      shifts.callEnded(playerId, reason);
    },
    turnChanged: (playerId) => shifts.turnChanged(playerId),
    callStarted: (playerId) => audits.callStarted(playerId),
    playerSaid: (playerId, text) => audits.playerSaid(playerId, text),
    victimSpoke: (playerId) => audits.victimSpoke(playerId),
  });
  calls.addPlayer(PlayerId);
  return {
    shifts,
    calls,
    audits,
    mail,
    results,
    audit: () => lastAudit,
    call: () => calls.snapshot(PlayerId) as CallSnapshot,
    shift: () => shifts.snapshot(PlayerId),
  };
}

type Game = ReturnType<typeof createGame>;

function finishLine(game: Game): void {
  const line = game.call().transcript?.messages.findLast((message) => message.speaker === "victim");
  advanceSeconds(Config.Turn.MinSpeakingSeconds);
  game.calls.finishedSpeaking(PlayerId, line?.speaker === "victim" ? line.lineId : -1);
}

function say(game: Game, text: string): void {
  game.calls.sendMessage(PlayerId, text);
  advanceSeconds(Config.Turn.ThinkingSeconds);
  finishLine(game);
}

/** Clocks in, waits for the call and answers it. */
function startCall(game: Game): void {
  game.shifts.clockIn(PlayerId);
  advanceSeconds(Config.Call.FirstCallDelaySeconds);
  game.calls.answer(PlayerId);
  finishLine(game);
}

function templates(game: Game): string[] {
  return game.mail.map((draft) => draft.template);
}

beforeEach(() => {
  vi.useFakeTimers();
  roll = 0;
  mode = "campaign";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AuditService: starting an audit", () => {
  it("rolls once, right after the player's AfterPlayerTurn-th message", () => {
    const game = createGame();
    startCall(game);
    for (let turn = 1; turn < AfterPlayerTurn; turn += 1) {
      say(game, "hello");
    }
    expect(game.mail).toEqual([]);
    game.calls.sendMessage(PlayerId, "hello");
    expect(templates(game)).toEqual(["auditAssigned"]);
    expect(game.mail[0]?.vars).toMatchObject({
      money: PassMoney,
      xp: PassXP,
      raise: FailQuotaRaise,
    });
    expect(game.audit()?.status).toBe("active");
  });

  it("doesn't start one when the roll misses", () => {
    roll = 0.99;
    const game = createGame();
    startCall(game);
    for (let turn = 0; turn < AfterPlayerTurn + 2; turn += 1) {
      say(game, "hello");
    }
    expect(game.mail).toEqual([]);
    expect(game.audit()).toBeNull();
  });

  it("in Sandbox, only starts from the test word", () => {
    mode = "sandbox";
    const game = createGame();
    startCall(game);
    for (let turn = 0; turn < AfterPlayerTurn + 1; turn += 1) {
      say(game, "hello");
    }
    expect(game.mail).toEqual([]);
    expect(game.audits.force(PlayerId, "sayPhrase")).toBe(true);
    expect(game.mail[0]).toEqual({
      template: "auditAssigned",
      vars: { objective: "sayPhrase", sandbox: 1 },
    });
  });

  it("grades a Sandbox audit off shift, with nothing paid or raised", () => {
    mode = "sandbox";
    const game = createGame();
    // Sandbox has no shift: ring a call straight away.
    game.calls.startCalls(PlayerId);
    advanceSeconds(Config.Call.FirstCallDelaySeconds);
    game.calls.answer(PlayerId);
    finishLine(game);
    game.audits.force(PlayerId, "sayPhrase");
    say(game, `${Phrase} ${Phrase}`);
    game.calls.hangUp(PlayerId);
    expect(game.audit()?.status).toBe("passed");
    expect(game.mail.at(-1)).toEqual({
      template: "auditPassed",
      vars: { objective: "sayPhrase", sandbox: 1 },
    });
    expect(game.shift().earnings).toBe(0);
  });

  it("never audits before a save is picked", () => {
    const game = createGame();
    startCall(game);
    mode = null;
    expect(game.audits.force(PlayerId, "sayPhrase")).toBe(false);
  });

  it("only one per call, and none between calls", () => {
    const game = createGame();
    expect(game.audits.force(PlayerId, null)).toBe(false);
    startCall(game);
    expect(game.audits.force(PlayerId, "sayPhrase")).toBe(true);
    expect(game.audits.force(PlayerId, "speedRun")).toBe(false);
  });

  it("stops at MaxPerShift unless forced", () => {
    const game = createGame();
    startCall(game);
    for (let count = 0; count < ServerConfig.Audit.MaxPerShift; count += 1) {
      expect(game.shifts.claimAudit(PlayerId, false)).toBe(true);
    }
    expect(game.shifts.claimAudit(PlayerId, false)).toBe(false);
    expect(game.audits.force(PlayerId, "sayPhrase")).toBe(true);
  });
});

describe("AuditService: grading", () => {
  it("pays a passed audit into the shift, with XP, and emails it", () => {
    const game = createGame();
    startCall(game);
    game.audits.force(PlayerId, "sayPhrase");
    say(game, `Hi! ${Phrase}.`);
    expect(game.audit()?.progress).toBe("1/2");
    say(game, `${Phrase}, really.`);
    game.calls.hangUp(PlayerId);
    expect(game.audit()?.status).toBe("passed");
    expect(templates(game)).toEqual(["auditAssigned", "auditPassed"]);
    expect(game.shift().earnings).toBe(PassMoney);
  });

  it("fails it when the victim hangs up, raising the quota", () => {
    const game = createGame();
    startCall(game);
    game.audits.force(PlayerId, "sayPhrase");
    say(game, `${Phrase} ${Phrase}`);
    game.calls.cheat(PlayerId, "hangUp");
    finishLine(game);
    expect(game.audit()?.status).toBe("failed");
    expect(game.mail.at(-1)).toEqual({
      template: "auditFailed",
      vars: {
        objective: "sayPhrase",
        raise: FailQuotaRaise,
        quota: Config.Shift.Quota + FailQuotaRaise,
      },
    });
    expect(game.shift().quota).toBe(Config.Shift.Quota + FailQuotaRaise);
  });

  it("shows a forbidden word as failed straight away, and grades it when the call ends", () => {
    const game = createGame();
    startCall(game);
    game.audits.force(PlayerId, "forbiddenWord");
    say(game, "This is definitely not a SCAM.");
    expect(game.audit()?.status).toBe("failed");
    expect(templates(game)).toEqual(["auditAssigned"]);
    say(game, "!reveal");
    game.calls.hangUp(PlayerId);
    expect(templates(game)).toEqual(["auditAssigned", "auditFailed"]);
  });

  it("passes a speed run when the code comes in time", () => {
    const game = createGame();
    startCall(game);
    game.audits.force(PlayerId, "speedRun");
    say(game, "!reveal");
    expect(game.audit()?.progress).toBe("Code got");
    game.calls.hangUp(PlayerId);
    expect(game.audit()?.status).toBe("passed");
  });

  it("passes an upsell when the Wobblebucks Card is read out", () => {
    const game = createGame();
    startCall(game);
    expect(game.audits.force(PlayerId, "upsell")).toBe(true);
    say(game, "!card");
    game.calls.hangUp(PlayerId);
    expect(game.audit()?.status).toBe("passed");
  });

  it("counts a passed audit when the call ending also ends the shift", () => {
    const game = createGame();
    startCall(game);
    game.audits.force(PlayerId, "sayPhrase");
    say(game, `${Phrase} ${Phrase}`);
    advanceSeconds(ShiftSeconds);
    expect(game.shift().status).toBe("overtime");
    // No code to redeem, so hanging up ends the shift there and then.
    game.calls.hangUp(PlayerId);
    expect(game.results[0]).toMatchObject({ earnings: PassMoney, auditsPassed: 1 });
  });

  it("doesn't grade a call cut off in overtime", () => {
    const game = createGame();
    startCall(game);
    game.audits.force(PlayerId, "sayPhrase");
    advanceSeconds(ShiftSeconds + Config.Shift.OvertimeIdleSeconds);
    expect(templates(game)).toEqual(["auditAssigned"]);
    expect(game.results[0]).toMatchObject({ quota: Config.Shift.Quota, auditsFailed: 0 });
  });

  it("doesn't show a speed run as lost while the victim answers the last message", () => {
    const game = createGame();
    startCall(game);
    game.audits.force(PlayerId, "speedRun");
    for (let turn = 1; turn < ServerConfig.Audit.SpeedRunTurns; turn += 1) {
      say(game, "hello");
    }
    game.calls.sendMessage(PlayerId, "hello");
    expect(game.audit()?.status).toBe("active");
    advanceSeconds(Config.Turn.ThinkingSeconds);
    expect(game.audit()?.status).toBe("failed");
  });

  it("clears the result when the player leaves the save", () => {
    const game = createGame();
    startCall(game);
    game.audits.force(PlayerId, "sayPhrase");
    game.calls.hangUp(PlayerId);
    game.audits.clear(PlayerId);
    expect(game.audit()).toBeNull();
  });

  it("doesn't grade a call cut off by the shift ending", () => {
    const game = createGame();
    startCall(game);
    game.audits.force(PlayerId, "sayPhrase");
    game.shifts.abandon(PlayerId);
    expect(templates(game)).toEqual(["auditAssigned"]);
    expect(game.audit()).toBeNull();
  });

  it("clears the last result when the next call is answered", () => {
    const game = createGame();
    startCall(game);
    game.audits.force(PlayerId, "sayPhrase");
    game.calls.hangUp(PlayerId);
    expect(game.audit()?.status).toBe("failed");
    advanceSeconds(Config.Call.SecondsBetweenCalls);
    game.calls.answer(PlayerId);
    expect(game.audit()).toBeNull();
  });
});
