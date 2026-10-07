// Rings calls and runs each player's calls, keyed by player id, so more players just means
// more entries. Ported from the Roblox CallService. For now the victim answers every
// message with their scenario's next scripted reply; turns (step 3), suspicion and codes
// (step 4) and the AI (step 8) build on this.
//
// A call: idle -> ringing -> (answered) inCall -> idle, or ringing -> (declined or missed)
// idle. The next call rings a few seconds after one ends. Every change sends the player a
// fresh snapshot.

import { Config } from "@shared/Config";
import { cleanMessage } from "@shared/messageText";
import { secondsToMs } from "@shared/time";
import type { CallEndReason, CallSnapshot, CallStatus, ChatMessage } from "@shared/types";
import type { ScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import type { AIReply, Scenario } from "@server/scenarios/scenarioSchema";

// Until levels exist (step 7), everyone is level 1.
const DefaultLevel = 1;

interface PlayerCall {
  status: CallStatus;
  // Who's calling or on the line, or who called last. null before the first call.
  scenario: Scenario | null;
  // Index of the next scripted reply.
  nextReply: number;
  // The call in progress, or the last one answered.
  transcript: {
    callerName: string;
    messages: ChatMessage[];
    endReason: CallEndReason | null;
  } | null;
  lastOutcome: CallEndReason | null;
  // The pending timer (the first call, a ring timing out, or the next call), if any.
  timer: ReturnType<typeof setTimeout> | null;
}

export interface CallServiceOptions {
  scenarios: ScenarioRegistry;
  // Sends a player their latest snapshot. Called after every change.
  send: (playerId: string, snapshot: CallSnapshot) => void;
  // A random number from 0 up to 1. Tests pass a predictable one.
  random?: () => number;
}

export class CallService {
  private readonly calls = new Map<string, PlayerCall>();
  private readonly scenarios: ScenarioRegistry;
  private readonly send: CallServiceOptions["send"];
  private readonly random: () => number;

  constructor(options: CallServiceOptions) {
    this.scenarios = options.scenarios;
    this.send = options.send;
    this.random = options.random ?? Math.random;
  }

  /** Starts a player's calls: the first one rings after a short wait. Does nothing if they
   * already have calls going (e.g. they reconnected). */
  addPlayer(playerId: string): void {
    if (this.calls.has(playerId)) {
      return;
    }
    const call: PlayerCall = {
      status: "idle",
      scenario: null,
      nextReply: 0,
      transcript: null,
      lastOutcome: null,
      timer: null,
    };
    this.calls.set(playerId, call);
    this.startTimer(call, Config.Call.FirstCallDelaySeconds, () => this.ring(playerId, call));
  }

  /** Forgets a player completely, cancelling anything pending. */
  removePlayer(playerId: string): void {
    const call = this.calls.get(playerId);
    if (call) {
      this.cancelTimer(call);
      this.calls.delete(playerId);
    }
  }

  /** Forgets every player, e.g. when the server shuts down. */
  removeAll(): void {
    for (const playerId of [...this.calls.keys()]) {
      this.removePlayer(playerId);
    }
  }

  hasPlayer(playerId: string): boolean {
    return this.calls.has(playerId);
  }

  /** What the player's client should show, or undefined for an unknown player. */
  snapshot(playerId: string): CallSnapshot | undefined {
    const call = this.calls.get(playerId);
    return call && this.makeSnapshot(call);
  }

  answer(playerId: string): void {
    const call = this.calls.get(playerId);
    if (call?.status !== "ringing" || !call.scenario) {
      return;
    }
    this.cancelTimer(call);
    const { greetings } = call.scenario.lines;
    const greeting = greetings[Math.floor(this.random() * greetings.length)] ?? greetings[0];
    call.status = "inCall";
    call.transcript = {
      callerName: call.scenario.persona.name,
      messages: greeting ? [{ speaker: "victim", text: greeting }] : [],
      endReason: null,
    };
    this.publish(playerId, call);
  }

  decline(playerId: string): void {
    const call = this.calls.get(playerId);
    if (call?.status === "ringing") {
      this.endCall(playerId, call, "declined");
    }
  }

  hangUp(playerId: string): void {
    const call = this.calls.get(playerId);
    if (call?.status === "inCall") {
      this.endCall(playerId, call, "playerHungUp");
    }
  }

  /** The player said something. Ignored outside a call, or if it's empty or too long. */
  sendMessage(playerId: string, text: string): void {
    const call = this.calls.get(playerId);
    if (call?.status !== "inCall" || !call.scenario || !call.transcript) {
      return;
    }
    const cleaned = cleanMessage(text);
    if (cleaned === null) {
      return;
    }
    const reply = this.takeFallbackReply(call, call.scenario);
    const { messages } = call.transcript;
    messages.push({ speaker: "player", text: cleaned }, { speaker: "victim", text: reply.reply });
    if (messages.length > Config.Call.MaxTranscriptMessages) {
      messages.splice(0, messages.length - Config.Call.MaxTranscriptMessages);
    }
    this.publish(playerId, call);
  }

  private ring(playerId: string, call: PlayerCall): void {
    call.scenario = this.scenarios.pick(DefaultLevel, call.scenario?.id ?? null, this.random);
    call.status = "ringing";
    call.nextReply = 0;
    call.lastOutcome = null;
    this.startTimer(call, Config.Call.RingSeconds, () => this.endCall(playerId, call, "missed"));
    this.publish(playerId, call);
  }

  private endCall(playerId: string, call: PlayerCall, reason: CallEndReason): void {
    if (call.status === "inCall" && call.transcript) {
      call.transcript.endReason = reason;
    }
    call.status = "idle";
    call.lastOutcome = reason;
    this.startTimer(call, Config.Call.SecondsBetweenCalls, () => this.ring(playerId, call));
    this.publish(playerId, call);
  }

  private takeFallbackReply(call: PlayerCall, scenario: Scenario): AIReply {
    const replies = scenario.lines.fallbackReplies;
    const index = call.nextReply % replies.length;
    call.nextReply = index + 1;
    const reply = replies[index];
    if (!reply) {
      // Can't happen: the registry makes sure every scenario has at least one.
      throw new Error(`Scenario ${scenario.id} has no fallback replies.`);
    }
    return reply;
  }

  /** Runs `callback` after `seconds`, replacing any timer already pending for this call. */
  private startTimer(call: PlayerCall, seconds: number, callback: () => void): void {
    this.cancelTimer(call);
    call.timer = setTimeout(() => {
      call.timer = null;
      callback();
    }, secondsToMs(seconds));
  }

  private cancelTimer(call: PlayerCall): void {
    if (call.timer !== null) {
      clearTimeout(call.timer);
      call.timer = null;
    }
  }

  private makeSnapshot(call: PlayerCall): CallSnapshot {
    const onCall = call.status !== "idle";
    return {
      status: call.status,
      caller: onCall && call.scenario ? call.scenario.persona.name : null,
      transcript: call.transcript && {
        ...call.transcript,
        messages: [...call.transcript.messages],
      },
      lastOutcome: call.lastOutcome,
    };
  }

  private publish(playerId: string, call: PlayerCall): void {
    this.send(playerId, this.makeSnapshot(call));
  }
}
