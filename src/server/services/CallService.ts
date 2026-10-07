// Rings calls and runs each player's calls, keyed by player id, so more players just means
// more entries. Ported from the Roblox CallService. For now the victim answers with their
// scenario's next scripted reply; suspicion and codes (step 4) and the AI (step 8) build on
// this.
//
// A call: idle -> ringing -> (answered) inCall -> idle, or ringing -> (declined or missed)
// idle. The next call rings a few seconds after one ends. Every change sends the player a
// fresh snapshot.
//
// Turns during a call: playerTurn -> (message received) processing -> (reply ready)
// victimTurn -> (victim finished speaking) playerTurn. A call starts with the victim's
// greeting. The client reports when it has finished saying each victim line; a safety timer
// moves on if it never does.

import { Config } from "@shared/Config";
import { cleanMessage } from "@shared/messageText";
import { safetySeconds } from "@shared/speechTiming";
import { MsPerSecond, secondsToMs } from "@shared/time";
import type {
  CallEndReason,
  CallSnapshot,
  CallStatus,
  ChatMessage,
  TurnState,
} from "@shared/types";
import type { ScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import type { AIReply, Scenario } from "@server/scenarios/scenarioSchema";

// Until levels exist (step 7), everyone is level 1.
const DefaultLevel = 1;

interface PlayerCall {
  status: CallStatus;
  // Goes up by one every time the phone rings, so a reply that arrives late (e.g. from the
  // AI, step 8) can tell whether the call it was for is still going.
  callId: number;
  // Who's calling or on the line, or who called last. null before the first call.
  scenario: Scenario | null;
  // Whose turn it is. Only meaningful while status is "inCall".
  turn: TurnState;
  // Messages the player has sent this call.
  playerTurns: number;
  // Index of the next scripted reply.
  nextReply: number;
  // Goes up by one for every victim line (never reset), so a late "finished speaking" for an
  // earlier line or call is ignored.
  lineId: number;
  // When the current victim line was sent (Date.now()), so a client can't end it early.
  lineStartedAt: number;
  // The call in progress, or the last one answered.
  transcript: {
    callerName: string;
    messages: ChatMessage[];
    endReason: CallEndReason | null;
  } | null;
  lastOutcome: CallEndReason | null;
  // The one pending timer: the next call ringing, a ring timing out, the victim thinking,
  // or the victim speaking. Starting a new one cancels the old one.
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
      callId: 0,
      scenario: null,
      turn: "playerTurn",
      playerTurns: 0,
      nextReply: 0,
      lineId: 0,
      lineStartedAt: 0,
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

  /** Picks up a ringing call. The victim opens with a greeting. */
  answer(playerId: string): void {
    const call = this.calls.get(playerId);
    if (call?.status !== "ringing" || !call.scenario) {
      return;
    }
    const { greetings } = call.scenario.lines;
    const greeting = greetings[Math.floor(this.random() * greetings.length)] ?? greetings[0];
    if (greeting === undefined) {
      // Can't happen: the registry makes sure every scenario has a greeting.
      throw new Error(`Scenario ${call.scenario.id} has no greetings.`);
    }
    call.status = "inCall";
    call.playerTurns = 0;
    call.transcript = { callerName: call.scenario.persona.name, messages: [], endReason: null };
    this.speak(playerId, call, greeting);
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

  /** The player said something. Only accepted on their turn, and if it isn't empty or too
   * long. The victim thinks for a moment, then replies. */
  sendMessage(playerId: string, text: string): void {
    const call = this.calls.get(playerId);
    if (call?.status !== "inCall" || call.turn !== "playerTurn" || !call.scenario) {
      return;
    }
    const cleaned = cleanMessage(text);
    if (cleaned === null) {
      return;
    }
    const scenario = call.scenario;
    const callId = call.callId;
    call.playerTurns += 1;
    this.addMessage(call, { speaker: "player", text: cleaned });
    call.turn = "processing";
    this.publish(playerId, call);

    // Waiting on the reply is the processing turn. Hanging up cancels this timer, and the
    // check makes sure a reply never lands on a call that has moved on.
    this.startTimer(call, Config.Turn.ThinkingSeconds, () => {
      if (call.callId !== callId || call.status !== "inCall" || call.turn !== "processing") {
        return;
      }
      const reply = this.takeFallbackReply(call, scenario);
      this.speak(playerId, call, reply.reply);
    });
  }

  /** The client finished saying victim line `lineId`. Ignored unless it's the line the call
   * is waiting on, and never accepted sooner than Config.Turn.MinSpeakingSeconds after the
   * line was sent. */
  finishedSpeaking(playerId: string, lineId: number): void {
    const call = this.calls.get(playerId);
    if (call?.status !== "inCall" || call.turn !== "victimTurn" || call.lineId !== lineId) {
      return;
    }
    const elapsedSeconds = (Date.now() - call.lineStartedAt) / MsPerSecond;
    // Capped, so a clock that jumps backwards can't stall the turn.
    const remaining = Math.min(
      Config.Turn.MinSpeakingSeconds - elapsedSeconds,
      Config.Turn.MinSpeakingSeconds,
    );
    if (remaining > 0) {
      // Replaces the safety timer with a short wait.
      this.startTimer(call, remaining, () => this.finishVictimTurn(playerId, call, lineId));
    } else {
      this.finishVictimTurn(playerId, call, lineId);
    }
  }

  private ring(playerId: string, call: PlayerCall): void {
    call.callId += 1;
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
    // Also cancels whatever the call was waiting on (a reply or a line being said).
    this.startTimer(call, Config.Call.SecondsBetweenCalls, () => this.ring(playerId, call));
    this.publish(playerId, call);
  }

  /** Adds a victim line to the call and starts the victim's turn, which ends in
   * finishVictimTurn when the client reports back, or when the safety timer runs out. */
  private speak(playerId: string, call: PlayerCall, text: string): void {
    call.lineId += 1;
    const lineId = call.lineId;
    call.lineStartedAt = Date.now();
    call.turn = "victimTurn";
    this.addMessage(call, { speaker: "victim", text, lineId });
    this.startTimer(call, safetySeconds(text), () => this.finishVictimTurn(playerId, call, lineId));
    this.publish(playerId, call);
  }

  /** The one way the victim's turn ends: the victim has finished saying line `lineId`, so
   * the turn goes back to the player. Step 9 calls this when real audio finishes. */
  private finishVictimTurn(playerId: string, call: PlayerCall, lineId: number): void {
    if (call.status !== "inCall" || call.turn !== "victimTurn" || call.lineId !== lineId) {
      return;
    }
    this.cancelTimer(call);
    call.turn = "playerTurn";
    this.publish(playerId, call);
  }

  private addMessage(call: PlayerCall, message: ChatMessage): void {
    if (!call.transcript) {
      return;
    }
    const { messages } = call.transcript;
    messages.push(message);
    if (messages.length > Config.Call.MaxTranscriptMessages) {
      messages.splice(0, messages.length - Config.Call.MaxTranscriptMessages);
    }
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
      turn: call.status === "inCall" ? call.turn : null,
      playerTurns: call.playerTurns,
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
