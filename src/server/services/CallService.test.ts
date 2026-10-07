import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Config } from "@shared/Config";
import type { CallSnapshot } from "@shared/types";
import { grandma } from "@server/scenarios/grandma";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import { CallService } from "@server/services/CallService";

const scenarios = createScenarioRegistry([grandma]);
const { fallbackReplies, greetings } = grandma.lines;
const PlayerId = "player-1";
const MsPerSecond = 1000;

function seconds(value: number): number {
  return value * MsPerSecond;
}

function setup(): { service: CallService; sent: CallSnapshot[]; latest: () => CallSnapshot } {
  const sent: CallSnapshot[] = [];
  const service = new CallService({
    scenarios,
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
  return { service, sent, latest };
}

/** Adds the player and waits for the first call to ring. */
function ringing(): ReturnType<typeof setup> {
  const test = setup();
  test.service.addPlayer(PlayerId);
  vi.advanceTimersByTime(seconds(Config.Call.FirstCallDelaySeconds));
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
    expect(latest().status).toBe("idle");

    vi.advanceTimersByTime(seconds(Config.Call.FirstCallDelaySeconds) - 1);
    expect(latest().status).toBe("idle");
    vi.advanceTimersByTime(1);
    expect(latest()).toMatchObject({ status: "ringing", caller: "Grandma Gertrude" });
  });

  it("counts an unanswered call as missed, then rings the next one", () => {
    const { latest } = ringing();
    vi.advanceTimersByTime(seconds(Config.Call.RingSeconds));
    expect(latest()).toMatchObject({ status: "idle", caller: null, lastOutcome: "missed" });

    vi.advanceTimersByTime(seconds(Config.Call.SecondsBetweenCalls));
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
  it("answers only while ringing, starting with a greeting", () => {
    const { service, latest } = setup();
    service.addPlayer(PlayerId);
    service.answer(PlayerId);
    expect(latest().status).toBe("idle");

    vi.advanceTimersByTime(seconds(Config.Call.FirstCallDelaySeconds));
    service.answer(PlayerId);
    expect(latest()).toMatchObject({ status: "inCall", caller: "Grandma Gertrude" });
    expect(latest().transcript?.messages).toEqual([{ speaker: "victim", text: greetings[0] }]);
  });

  it("stops the ring timer once answered", () => {
    const { service, latest } = ringing();
    service.answer(PlayerId);
    vi.advanceTimersByTime(seconds(Config.Call.RingSeconds * 10));
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

    vi.advanceTimersByTime(seconds(Config.Call.SecondsBetweenCalls));
    expect(latest().status).toBe("ringing");
  });

  it("hangs up only a call in progress, keeping its transcript", () => {
    const { service, latest } = ringing();
    service.hangUp(PlayerId);
    expect(latest().status).toBe("ringing");

    service.answer(PlayerId);
    service.hangUp(PlayerId);
    expect(latest()).toMatchObject({ status: "idle", lastOutcome: "playerHungUp" });
    expect(latest().transcript).toMatchObject({
      callerName: "Grandma Gertrude",
      endReason: "playerHungUp",
    });

    vi.advanceTimersByTime(seconds(Config.Call.SecondsBetweenCalls));
    expect(latest().status).toBe("ringing");
  });
});

describe("CallService: messages", () => {
  it("answers each message with the next scripted reply, starting over at the end", () => {
    const { service, latest } = ringing();
    service.answer(PlayerId);
    for (let turn = 0; turn <= fallbackReplies.length; turn++) {
      service.sendMessage(PlayerId, `message ${turn}`);
    }
    const messages = latest().transcript?.messages ?? [];
    expect(messages[1]).toEqual({ speaker: "player", text: "message 0" });
    expect(messages[2]).toEqual({ speaker: "victim", text: fallbackReplies[0]?.reply });
    expect(messages[4]).toEqual({ speaker: "victim", text: fallbackReplies[1]?.reply });
    expect(messages.at(-1)).toEqual({ speaker: "victim", text: fallbackReplies[0]?.reply });
  });

  it("cleans messages and ignores empty or too long ones", () => {
    const { service, latest } = ringing();
    service.answer(PlayerId);
    service.sendMessage(PlayerId, "   ");
    service.sendMessage(PlayerId, "x".repeat(Config.Call.MaxTypedMessageLength + 1));
    expect(latest().transcript?.messages).toHaveLength(1);

    service.sendMessage(PlayerId, "  hello\nthere  ");
    expect(latest().transcript?.messages[1]).toEqual({ speaker: "player", text: "hello there" });
  });

  it("leaves the last transcript's ending alone when a later call is missed", () => {
    const { service, latest } = ringing();
    service.answer(PlayerId);
    service.hangUp(PlayerId);
    vi.advanceTimersByTime(seconds(Config.Call.SecondsBetweenCalls + Config.Call.RingSeconds));
    expect(latest()).toMatchObject({
      lastOutcome: "missed",
      transcript: { endReason: "playerHungUp" },
    });
  });

  it("keeps only the most recent messages in a long call", () => {
    const { service, latest } = ringing();
    service.answer(PlayerId);
    for (let turn = 0; turn < Config.Call.MaxTranscriptMessages; turn++) {
      service.sendMessage(PlayerId, `message ${turn}`);
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
    expect(sent).toHaveLength(before);
  });

  it("starts each answered call with a fresh transcript and replies from the top", () => {
    const { service, latest } = ringing();
    service.answer(PlayerId);
    service.sendMessage(PlayerId, "first call");
    service.hangUp(PlayerId);
    vi.advanceTimersByTime(seconds(Config.Call.SecondsBetweenCalls));

    service.answer(PlayerId);
    service.sendMessage(PlayerId, "second call");
    expect(latest().transcript?.messages).toEqual([
      { speaker: "victim", text: greetings[0] },
      { speaker: "player", text: "second call" },
      { speaker: "victim", text: fallbackReplies[0]?.reply },
    ]);
  });
});

describe("CallService: cleanup", () => {
  it("cancels every timer when a player is removed", () => {
    const { service } = ringing();
    expect(vi.getTimerCount()).toBe(1);
    service.removePlayer(PlayerId);
    expect(vi.getTimerCount()).toBe(0);
    expect(service.hasPlayer(PlayerId)).toBe(false);
  });

  it("cancels everyone's timers on removeAll", () => {
    const { service } = setup();
    service.addPlayer("a");
    service.addPlayer("b");
    expect(vi.getTimerCount()).toBe(2);
    service.removeAll();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends a snapshot for every change", () => {
    const { service, sent } = ringing();
    service.answer(PlayerId);
    service.sendMessage(PlayerId, "hi");
    service.hangUp(PlayerId);
    expect(sent.map((snapshot) => snapshot.status)).toEqual([
      "ringing",
      "inCall",
      "inCall",
      "idle",
    ]);
  });
});
