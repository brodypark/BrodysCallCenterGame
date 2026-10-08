import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safetySeconds } from "@shared/speechTiming";
import { secondsToMs } from "@shared/time";
import type { CallSnapshot } from "@shared/types";
import { Config } from "@shared/Config";
import { AllScenarios } from "@server/scenarios/all";
import { grandma } from "@server/scenarios/grandma";
import { createScenarioRegistry, type ScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import type { AIReply, ScenarioInput } from "@server/scenarios/scenarioSchema";
import { CallService } from "@server/services/CallService";
import { RedeemService } from "@server/services/RedeemService";

const scenarios = createScenarioRegistry([grandma]);
const { fallbackReplies, greetings } = grandma.lines;
const PlayerId = "player-1";
const CodeShape = new RegExp(`GMA-[${Config.Code.Characters}]{${Config.Code.GroupLength}}`);

/** Grandma, but every scripted reply is `reply`. */
function grandmaAlwaysSaying(reply: AIReply): ScenarioRegistry {
  const variant: ScenarioInput = {
    ...grandma,
    lines: { ...grandma.lines, fallbackReplies: [reply] },
  };
  return createScenarioRegistry([variant]);
}

interface SetupOptions {
  registry?: ScenarioRegistry;
  allowTestWords?: boolean;
}

interface TestCall {
  service: CallService;
  redeem: RedeemService;
  earnings: number[];
  sent: CallSnapshot[];
  latest: () => CallSnapshot;
  // The id of the newest victim line.
  lastLineId: () => number;
  // The client says the current line has been said, after the shortest speaking time.
  finishLine: () => void;
  // The player sends `text`, the victim thinks, replies and finishes saying it.
  say: (text: string) => void;
}

function advanceSeconds(seconds: number): void {
  vi.advanceTimersByTime(secondsToMs(seconds));
}

function setup(options: SetupOptions = {}): TestCall {
  const sent: CallSnapshot[] = [];
  const earnings: number[] = [];
  const redeem = new RedeemService({
    onRedeemed: (_playerId, card) => earnings.push(card.value),
  });
  const service = new CallService({
    scenarios: options.registry ?? scenarios,
    codes: redeem,
    allowTestWords: options.allowTestWords ?? true,
    send: (_playerId, snapshot) => sent.push(snapshot),
    // Always the first greeting.
    random: () => 0,
  });
  const latest = (): CallSnapshot => {
    const snapshot = service.snapshot(PlayerId);
    if (!snapshot) {
      throw new Error("No snapshot for the test player");
    }
    return snapshot;
  };
  const lastLineId = (): number => {
    const line = latest().transcript?.messages.findLast((message) => message.speaker === "victim");
    return line?.speaker === "victim" ? line.lineId : -1;
  };

  const finishLine = (): void => {
    advanceSeconds(Config.Turn.MinSpeakingSeconds);
    service.finishedSpeaking(PlayerId, lastLineId());
  };
  const say = (text: string): void => {
    service.sendMessage(PlayerId, text);
    advanceSeconds(Config.Turn.ThinkingSeconds);
    finishLine();
  };
  return { service, redeem, earnings, sent, latest, lastLineId, finishLine, say };
}

/** Adds the player and waits for the first call to ring. */
function ringing(options: SetupOptions = {}): TestCall {
  const test = setup(options);
  test.service.addPlayer(PlayerId);
  test.service.startCalls(PlayerId);
  advanceSeconds(Config.Call.FirstCallDelaySeconds);
  return test;
}

/** A call that's been answered, with the greeting said: the player's turn. */
function playerTurn(options: SetupOptions = {}): TestCall {
  const test = ringing(options);
  test.service.answer(PlayerId);
  test.finishLine();
  return test;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CallService: ringing", () => {
  it("rings a call a short while after the player arrives", () => {
    const { service, latest } = setup();
    service.addPlayer(PlayerId);
    advanceSeconds(Config.Call.FirstCallDelaySeconds * 10);
    // Nothing rings until the shift turns calls on.
    expect(latest().status).toBe("idle");
    service.startCalls(PlayerId);

    vi.advanceTimersByTime(secondsToMs(Config.Call.FirstCallDelaySeconds) - 1);
    expect(latest().status).toBe("idle");
    vi.advanceTimersByTime(1);
    expect(latest()).toMatchObject({ status: "ringing", caller: "Grandma Gertrude", turn: null });
  });

  it("counts an unanswered call as missed, then rings the next one", () => {
    const { latest } = ringing();
    advanceSeconds(Config.Call.RingSeconds);
    expect(latest()).toMatchObject({ status: "idle", caller: null, lastOutcome: "missed" });

    advanceSeconds(Config.Call.SecondsBetweenCalls);
    expect(latest()).toMatchObject({ status: "ringing", lastOutcome: null });
  });

  it("does nothing new when a reconnecting player is added again", () => {
    const { service, latest } = ringing();
    service.addPlayer(PlayerId);
    expect(latest().status).toBe("ringing");
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("CallService: answering, declining and hanging up", () => {
  it("answers only while ringing, opening with the victim saying a greeting", () => {
    const { service, latest } = setup();
    service.addPlayer(PlayerId);
    service.startCalls(PlayerId);
    service.answer(PlayerId);
    expect(latest().status).toBe("idle");

    advanceSeconds(Config.Call.FirstCallDelaySeconds);
    service.answer(PlayerId);
    expect(latest()).toMatchObject({ status: "inCall", turn: "victimTurn", playerTurns: 0 });
    expect(latest().transcript?.messages).toEqual([
      { speaker: "victim", text: greetings[0], lineId: 1 },
    ]);
  });

  it("stops the ring timer once answered", () => {
    const { service, latest } = ringing();
    service.answer(PlayerId);
    advanceSeconds(Config.Call.RingSeconds * 10);
    expect(latest().status).toBe("inCall");
  });

  it("declines only a ringing call, and the next one rings later", () => {
    const { service, latest } = ringing();
    service.decline(PlayerId);
    expect(latest()).toMatchObject({ status: "idle", lastOutcome: "declined" });

    // Declining again, or hanging up, does nothing between calls.
    service.decline(PlayerId);
    service.hangUp(PlayerId);
    expect(latest().lastOutcome).toBe("declined");

    advanceSeconds(Config.Call.SecondsBetweenCalls);
    expect(latest().status).toBe("ringing");
  });

  it("hangs up only a call in progress, keeping its transcript", () => {
    const { service, latest } = ringing();
    service.hangUp(PlayerId);
    expect(latest().status).toBe("ringing");

    service.answer(PlayerId);
    service.hangUp(PlayerId);
    expect(latest()).toMatchObject({ status: "idle", lastOutcome: "playerHungUp", turn: null });
    expect(latest().transcript).toMatchObject({
      callerName: "Grandma Gertrude",
      endReason: "playerHungUp",
    });

    advanceSeconds(Config.Call.SecondsBetweenCalls);
    expect(latest().status).toBe("ringing");
  });

  it("leaves the last transcript's ending alone when a later call is missed", () => {
    const { service, latest } = ringing();
    service.answer(PlayerId);
    service.hangUp(PlayerId);
    advanceSeconds(Config.Call.SecondsBetweenCalls + Config.Call.RingSeconds);
    expect(latest()).toMatchObject({
      lastOutcome: "missed",
      transcript: { endReason: "playerHungUp" },
    });
  });
});

describe("CallService: turns", () => {
  it("goes player -> thinking -> talking -> player", () => {
    const { service, latest, finishLine } = playerTurn();
    expect(latest().turn).toBe("playerTurn");

    service.sendMessage(PlayerId, "Hello Gertrude!");
    expect(latest()).toMatchObject({ turn: "processing", playerTurns: 1 });
    expect(latest().transcript?.messages.at(-1)).toEqual({
      speaker: "player",
      text: "Hello Gertrude!",
    });

    vi.advanceTimersByTime(secondsToMs(Config.Turn.ThinkingSeconds) - 1);
    expect(latest().turn).toBe("processing");
    vi.advanceTimersByTime(1);
    expect(latest().turn).toBe("victimTurn");
    expect(latest().transcript?.messages.at(-1)).toEqual({
      speaker: "victim",
      text: fallbackReplies[0]?.reply,
      lineId: 2,
    });

    finishLine();
    expect(latest().turn).toBe("playerTurn");
  });

  it("ignores messages sent while the victim is greeting, thinking or talking", () => {
    const { service, latest } = ringing();
    service.answer(PlayerId);
    service.sendMessage(PlayerId, "during the greeting");
    expect(latest().transcript?.messages).toHaveLength(1);

    advanceSeconds(Config.Turn.MinSpeakingSeconds);
    service.finishedSpeaking(PlayerId, 1);
    service.sendMessage(PlayerId, "first");
    service.sendMessage(PlayerId, "spam while thinking");
    advanceSeconds(Config.Turn.ThinkingSeconds);
    service.sendMessage(PlayerId, "spam while talking");

    const texts = latest().transcript?.messages.map((message) => message.text);
    expect(texts).toEqual([greetings[0], "first", fallbackReplies[0]?.reply]);
    expect(latest().playerTurns).toBe(1);
  });

  it("ignores finished speaking for the wrong line, twice, or outside the victim's turn", () => {
    const { service, latest, lastLineId } = ringing();
    service.answer(PlayerId);
    advanceSeconds(Config.Turn.MinSpeakingSeconds);

    service.finishedSpeaking(PlayerId, lastLineId() + 1);
    service.finishedSpeaking(PlayerId, lastLineId() - 1);
    expect(latest().turn).toBe("victimTurn");

    service.finishedSpeaking(PlayerId, lastLineId());
    expect(latest().turn).toBe("playerTurn");
    // A duplicate after the turn moved on does nothing.
    service.finishedSpeaking(PlayerId, lastLineId());
    service.sendMessage(PlayerId, "hi");
    service.finishedSpeaking(PlayerId, lastLineId());
    expect(latest().turn).toBe("processing");
  });

  it("doesn't end a line sooner than the shortest speaking time", () => {
    const { service, latest, lastLineId } = ringing();
    service.answer(PlayerId);
    service.finishedSpeaking(PlayerId, lastLineId());
    expect(latest().turn).toBe("victimTurn");

    vi.advanceTimersByTime(secondsToMs(Config.Turn.MinSpeakingSeconds) - 1);
    expect(latest().turn).toBe("victimTurn");
    vi.advanceTimersByTime(1);
    expect(latest().turn).toBe("playerTurn");
  });

  it("doesn't push the end of a line later when it's reported again during the wait", () => {
    const { service, latest, lastLineId } = ringing();
    service.answer(PlayerId);
    service.finishedSpeaking(PlayerId, lastLineId());
    advanceSeconds(Config.Turn.MinSpeakingSeconds / 2);
    service.finishedSpeaking(PlayerId, lastLineId());
    advanceSeconds(Config.Turn.MinSpeakingSeconds / 2);
    expect(latest().turn).toBe("playerTurn");
  });

  it("gives the turn back when the client never reports the line as said", () => {
    const { service, latest } = ringing();
    service.answer(PlayerId);
    const greeting = greetings[0] ?? "";

    vi.advanceTimersByTime(secondsToMs(safetySeconds(greeting)) - 1);
    expect(latest().turn).toBe("victimTurn");
    vi.advanceTimersByTime(1);
    expect(latest().turn).toBe("playerTurn");
  });

  it("drops a reply that was still coming when the player hung up", () => {
    const { service, latest } = playerTurn();
    service.sendMessage(PlayerId, "goodbye");
    service.hangUp(PlayerId);
    advanceSeconds(Config.Turn.ThinkingSeconds);

    const messages = latest().transcript?.messages ?? [];
    expect(messages.at(-1)).toEqual({ speaker: "player", text: "goodbye" });
    expect(latest().status).toBe("idle");
  });

  it("ignores a late finished speaking from the previous call", () => {
    const { service, latest, lastLineId } = ringing();
    service.answer(PlayerId);
    const oldLine = lastLineId();
    service.hangUp(PlayerId);
    advanceSeconds(Config.Call.SecondsBetweenCalls);
    service.answer(PlayerId);
    advanceSeconds(Config.Turn.MinSpeakingSeconds);

    service.finishedSpeaking(PlayerId, oldLine);
    expect(latest().turn).toBe("victimTurn");
    service.finishedSpeaking(PlayerId, lastLineId());
    expect(latest().turn).toBe("playerTurn");
  });
});

describe("CallService: suspicion", () => {
  it("starts each call at the scenario's starting suspicion", () => {
    const { latest } = playerTurn();
    // 40 of Grandma's 100: 60% trust, and not yet below her trust level of 30.
    expect(latest().trust).toEqual({ percent: 60, word: "unsure", revealAt: 70 });
    expect(latest().codeRevealed).toBe(false);
  });

  it("moves with each reply, within the per-turn limit", () => {
    const { latest, say } = playerTurn();
    say("hello");
    // The first scripted reply lowers suspicion by 5.
    expect(latest().trust?.percent).toBe(65);

    say("!sus");
    expect(latest().trust?.percent).toBe(65 - Config.Suspicion.MaxRisePerTurn);
  });

  // (Replies that aren't numbers are covered in suspicion.test.ts; the scenario check
  // won't even accept one in a scripted reply.)
  it("clamps a reply that goes too far", () => {
    const { latest, say } = playerTurn({
      registry: grandmaAlwaysSaying({ reply: "Calm.", suspicionChange: -1000, revealsCode: false }),
    });
    say("hi");
    expect(latest().trust?.percent).toBe(60 + Config.Suspicion.MaxDropPerTurn);
  });

  it("hangs up once the victim finishes their line at the threshold", () => {
    const { service, latest, say, finishLine } = playerTurn();
    // 40 + 15 + 15 + 15 = 85: angry, but still on the line.
    say("!sus");
    say("!sus");
    say("!sus");
    expect(latest().trust?.word).toBe("angry");

    service.sendMessage(PlayerId, "!sus");
    advanceSeconds(Config.Turn.ThinkingSeconds);
    expect(latest().transcript?.messages.at(-1)?.text).toContain(grandma.lines.hangUpLine);
    expect(latest().status).toBe("inCall");

    finishLine();
    expect(latest()).toMatchObject({
      status: "idle",
      lastOutcome: "victimHungUp",
      transcript: { endReason: "victimHungUp" },
    });
  });
});

describe("CallService: the code", () => {
  it("reads the code out inside the victim's line, and makes it redeemable", () => {
    const { latest, say, redeem, earnings } = playerTurn();
    say("!reveal");
    const line = latest().transcript?.messages.at(-1)?.text ?? "";
    const code = CodeShape.exec(line)?.[0] ?? "";
    expect(code).not.toBe("");
    expect(line).toContain(grandma.lines.revealLine.replace("{code}", code));
    expect(latest().codeRevealed).toBe(true);

    expect(redeem.redeem(PlayerId, code).success).toBe(true);
    expect(earnings).toEqual([grandma.cardValue]);
  });

  it("only ever sends the code inside the line it's read out in", () => {
    const { latest, say } = playerTurn();
    say("!reveal");
    const snapshot = JSON.stringify(latest());
    const code = CodeShape.exec(snapshot)?.[0] ?? "";
    expect(snapshot.split(code)).toHaveLength(2);
  });

  it("reads the same code again if asked twice", () => {
    const { latest, say } = playerTurn();
    say("!reveal");
    say("!reveal");
    const codes = (latest().transcript?.messages ?? [])
      .map((message) => CodeShape.exec(message.text)?.[0])
      .filter((code) => code !== undefined);
    expect(codes).toHaveLength(2);
    expect(new Set(codes).size).toBe(1);
  });

  it("isn't read out before enough turns, even when trusting", () => {
    const registry = grandmaAlwaysSaying({
      reply: "Here!",
      suspicionChange: -25,
      revealsCode: true,
    });
    const { latest, say } = playerTurn({ registry });
    for (let turn = 1; turn < Config.Call.MinTurnsBeforeReveal; turn++) {
      say(`turn ${turn}`);
      expect(latest().transcript?.messages.at(-1)?.text).toBe(
        `Here! ${grandma.lines.notReadyLine}`,
      );
    }
    say("last try");
    expect(latest().codeRevealed).toBe(true);
  });

  it("isn't read out while the victim is still too suspicious", () => {
    const registry = grandmaAlwaysSaying({ reply: "Hmm.", suspicionChange: 0, revealsCode: true });
    const { latest, say } = playerTurn({ registry });
    for (let turn = 0; turn < Config.Call.MinTurnsBeforeReveal + 2; turn++) {
      say(`turn ${turn}`);
    }
    expect(latest().codeRevealed).toBe(false);
    expect(latest().transcript?.messages.at(-1)?.text).toBe(`Hmm. ${grandma.lines.notReadyLine}`);
  });

  it("treats test words as normal messages when they're switched off", () => {
    const { latest, say } = playerTurn({ allowTestWords: false });
    say("!reveal");
    expect(latest().transcript?.messages.at(-1)?.text).toBe(fallbackReplies[0]?.reply);
    expect(latest().codeRevealed).toBe(false);
  });

  it("starts the next call with a fresh code and suspicion", () => {
    const { service, latest, say, finishLine } = playerTurn();
    say("!reveal");
    service.hangUp(PlayerId);
    advanceSeconds(Config.Call.SecondsBetweenCalls);
    service.answer(PlayerId);
    finishLine();
    expect(latest()).toMatchObject({ codeRevealed: false, trust: { percent: 60 } });
  });
});

describe("Scenario fallback replies", () => {
  // CLAUDE.md: tuned so suspicion drifts below the trust level and the code comes out around
  // turn 9-10, without ever reaching the hang-up threshold.
  it.each(AllScenarios.map((scenario) => [scenario.id, scenario] as const))(
    "%s reveals the code around turn 9-10 without hanging up",
    (_id, scenario) => {
      const { latest, say } = playerTurn({
        registry: createScenarioRegistry([scenario]),
        allowTestWords: false,
      });
      let revealedOn = 0;
      for (let turn = 1; turn <= scenario.lines.fallbackReplies.length && !revealedOn; turn++) {
        say(`message ${turn}`);
        expect(latest().status).toBe("inCall");
        if (latest().codeRevealed) {
          revealedOn = turn;
        }
      }
      expect(revealedOn).toBeGreaterThanOrEqual(9);
      expect(revealedOn).toBeLessThanOrEqual(10);
    },
  );
});

describe("CallService: messages", () => {
  it("replies with the scripted lines in order, starting over at the end", () => {
    const { latest, say } = playerTurn();
    for (let turn = 0; turn <= fallbackReplies.length; turn++) {
      say(`message ${turn}`);
    }
    const victimLines = (latest().transcript?.messages ?? [])
      .filter((message) => message.speaker === "victim")
      .map((message) => message.text);
    expect(victimLines.slice(1, 3)).toEqual([fallbackReplies[0]?.reply, fallbackReplies[1]?.reply]);
    expect(victimLines.at(-1)).toBe(fallbackReplies[0]?.reply);
    expect(latest().playerTurns).toBe(fallbackReplies.length + 1);
  });

  it("cleans messages and ignores empty or too long ones without using a turn", () => {
    const { service, latest } = playerTurn();
    service.sendMessage(PlayerId, "   ");
    service.sendMessage(PlayerId, "x".repeat(Config.Call.MaxTypedMessageLength + 1));
    expect(latest()).toMatchObject({ turn: "playerTurn", playerTurns: 0 });

    service.sendMessage(PlayerId, "  hello\nthere  ");
    expect(latest().transcript?.messages.at(-1)).toEqual({
      speaker: "player",
      text: "hello there",
    });
  });

  it("keeps only the most recent messages in a long call", () => {
    const { latest, say } = playerTurn();
    for (let turn = 0; turn < Config.Call.MaxTranscriptMessages; turn++) {
      say(`message ${turn}`);
    }
    const messages = latest().transcript?.messages ?? [];
    expect(messages).toHaveLength(Config.Call.MaxTranscriptMessages);
    expect(messages.at(-2)).toEqual({
      speaker: "player",
      text: `message ${Config.Call.MaxTranscriptMessages - 1}`,
    });
  });

  it("ignores messages outside a call", () => {
    const { service, sent } = ringing();
    const before = sent.length;
    service.sendMessage(PlayerId, "hello?");
    service.sendMessage("someone-else", "hello?");
    service.finishedSpeaking("someone-else", 1);
    expect(sent).toHaveLength(before);
  });

  it("starts each answered call with a fresh transcript and replies from the top", () => {
    const { service, latest, say, finishLine } = playerTurn();
    say("first call");
    service.hangUp(PlayerId);
    advanceSeconds(Config.Call.SecondsBetweenCalls);

    service.answer(PlayerId);
    finishLine();
    say("second call");
    expect(latest().transcript?.messages.map((message) => message.text)).toEqual([
      greetings[0],
      "second call",
      fallbackReplies[0]?.reply,
    ]);
    expect(latest().playerTurns).toBe(1);
  });
});

describe("CallService: starting and stopping calls", () => {
  it("counts a ringing call as missed and rings no more once calls stop", () => {
    const { service, latest } = ringing();
    service.stopCalls(PlayerId);
    expect(latest()).toMatchObject({ status: "idle", lastOutcome: "missed" });
    advanceSeconds(Config.Call.SecondsBetweenCalls * 10);
    expect(latest().status).toBe("idle");
  });

  it("lets a call in progress finish after calls stop, then rings no more", () => {
    const { service, latest } = playerTurn();
    service.stopCalls(PlayerId);
    expect(latest().status).toBe("inCall");
    service.hangUp(PlayerId);
    advanceSeconds(Config.Call.SecondsBetweenCalls * 10);
    expect(latest().status).toBe("idle");
  });

  it("cuts a call off with forceHangUp, and only a call in progress", () => {
    const { service, latest } = ringing();
    expect(service.forceHangUp(PlayerId, "shiftEnded")).toBe(false);
    service.answer(PlayerId);
    expect(service.forceHangUp(PlayerId, "shiftEnded")).toBe(true);
    expect(latest()).toMatchObject({ status: "idle", lastOutcome: "shiftEnded" });
  });

  it("tells the listener about calls ending and turns changing", () => {
    const { service, finishLine } = ringing();
    const events: string[] = [];
    service.setListener({
      callEnded: (_playerId, reason) => events.push(`ended:${reason}`),
      turnChanged: () => events.push("turn"),
    });
    service.answer(PlayerId);
    finishLine();
    service.hangUp(PlayerId);
    expect(events).toEqual(["turn", "turn", "ended:playerHungUp"]);
  });
});

describe("CallService: cleanup", () => {
  it("cancels every timer when a player is removed, even mid-reply", () => {
    const { service } = playerTurn();
    service.sendMessage(PlayerId, "hi");
    expect(vi.getTimerCount()).toBe(1);
    service.removePlayer(PlayerId);
    expect(vi.getTimerCount()).toBe(0);
    expect(service.hasPlayer(PlayerId)).toBe(false);
  });

  it("cancels everyone's timers on removeAll", () => {
    const { service } = setup();
    for (const playerId of ["a", "b"]) {
      service.addPlayer(playerId);
      service.startCalls(playerId);
    }
    expect(vi.getTimerCount()).toBe(2);
    service.removeAll();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends a snapshot for every change", () => {
    const { service, sent, finishLine } = ringing();
    service.answer(PlayerId);
    finishLine();
    service.sendMessage(PlayerId, "hi");
    advanceSeconds(Config.Turn.ThinkingSeconds);
    service.hangUp(PlayerId);
    expect(sent.map((snapshot) => snapshot.turn ?? snapshot.status)).toEqual([
      "ringing",
      "victimTurn",
      "playerTurn",
      "processing",
      "victimTurn",
      "idle",
    ]);
  });
});
