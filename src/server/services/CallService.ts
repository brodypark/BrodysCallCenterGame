// Rings calls and runs each player's calls, keyed by player id, so more players just means
// more entries. Ported from the Roblox CallService. For now the victim answers with their
// scenario's next scripted reply; the AI (step 8) will slot in where that reply is taken.
//
// A call: idle -> ringing -> (answered) inCall -> idle, or ringing -> (declined or missed)
// idle. Calls only ring while the shift has turned them on (startCalls / stopCalls); the next
// call rings a few seconds after one ends. Every change sends the player a fresh snapshot,
// and the listener (ShiftService) hears about calls ending and turns changing.
//
// Turns during a call: playerTurn -> (message received) processing -> (reply ready)
// victimTurn -> (victim finished speaking) playerTurn. A call starts with the victim's
// greeting. The client reports when it has finished saying each victim line; a safety timer
// moves on if it never does.
//
// Every reply moves the victim's suspicion. Reaching the scenario's threshold makes them hang
// up. Below the trust level, after a few turns, a reply that offers the code gets it read
// out; the server makes the code and puts it in the line, so the client only ever sees it
// there. Replies only suggest; the server decides.

import { Config } from "@shared/Config";
import { cleanMessage } from "@shared/messageText";
import { safetySeconds } from "@shared/speechTiming";
import { MsPerSecond, secondsToMs } from "@shared/time";
import type {
  CallEndReason,
  CallSnapshot,
  CallStatus,
  ChatMessage,
  Difficulty,
  TurnState,
} from "@shared/types";
import { matchTestWord } from "@server/prompts/DebugReplies";
import type { ScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import type { AIReply, Scenario } from "@server/scenarios/scenarioSchema";
import { applySuspicionChange, trustMeter } from "@server/services/suspicion";

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
  // From Config.Suspicion.Min (fooled) to Max. Starts at the scenario's startingSuspicion.
  suspicion: number;
  // This call's code, once the victim has read it out. null before that.
  code: string | null;
  // Set while the victim says their last line: how the call ends once they finish.
  endAfterLine: CallEndReason | null;
  // Index of the next scripted reply.
  nextReply: number;
  // Goes up by one for every victim line (never reset), so a late "finished speaking" for an
  // earlier line or call is ignored.
  lineId: number;
  // When the current victim line was sent (Date.now()), so a client can't end it early.
  lineStartedAt: number;
  // The call in progress, or the last one answered: what the player sees, codes included.
  // The AI (step 8) must get its own history without the codes, saying only that one was
  // read out, so a prompt trick can never get it to repeat or change one.
  transcript: {
    callerName: string;
    messages: ChatMessage[];
    endReason: CallEndReason | null;
  } | null;
  lastOutcome: CallEndReason | null;
  // True while new calls may ring (during a shift, before the timer runs out).
  acceptingCalls: boolean;
  // The one pending timer: the next call ringing, a ring timing out, the victim thinking,
  // or the victim speaking. Starting a new one cancels the old one.
  timer: ReturnType<typeof setTimeout> | null;
}

/** What CallService needs from RedeemService: making codes and making them redeemable. */
export interface CodeIssuer {
  generateCode: (playerId: string, prefix: string) => string;
  registerGiftCard: (
    playerId: string,
    code: string,
    card: { value: number; difficulty: Difficulty },
  ) => void;
}

/** Told about calls as they happen. Set by the shift. */
export interface CallListener {
  // A call ended, for any reason.
  callEnded: (playerId: string, reason: CallEndReason) => void;
  // Whose turn it is changed during a call.
  turnChanged: (playerId: string) => void;
}

// What the victim says next, and how the call ends after it (if it does).
interface Line {
  text: string;
  endAfter: CallEndReason | null;
}

export interface CallServiceOptions {
  scenarios: ScenarioRegistry;
  codes: CodeIssuer;
  // Whether the test words (!reveal, !sus, !calm) work. Never in production.
  allowTestWords: boolean;
  // Sends a player their latest snapshot. Called after every change.
  send: (playerId: string, snapshot: CallSnapshot) => void;
  // A random number from 0 up to 1. Tests pass a predictable one.
  random?: () => number;
}

export class CallService {
  private readonly calls = new Map<string, PlayerCall>();
  private readonly scenarios: ScenarioRegistry;
  private readonly codes: CodeIssuer;
  private readonly allowTestWords: boolean;
  private readonly send: CallServiceOptions["send"];
  private readonly random: () => number;
  private listener: CallListener | null = null;

  constructor(options: CallServiceOptions) {
    this.scenarios = options.scenarios;
    this.codes = options.codes;
    this.allowTestWords = options.allowTestWords;
    this.send = options.send;
    this.random = options.random ?? Math.random;
  }

  /** Sets who's told about calls ending and turns changing. There's only one listener. */
  setListener(listener: CallListener): void {
    this.listener = listener;
  }

  /** Sets up a player's calls. Nothing rings until startCalls. Does nothing if they're
   * already set up (e.g. they reconnected). */
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
      suspicion: 0,
      code: null,
      endAfterLine: null,
      nextReply: 0,
      lineId: 0,
      lineStartedAt: 0,
      transcript: null,
      lastOutcome: null,
      acceptingCalls: false,
      timer: null,
    };
    this.calls.set(playerId, call);
  }

  /** Starts ringing calls, e.g. when the player clocks in. The first rings after a moment. */
  startCalls(playerId: string): void {
    const call = this.calls.get(playerId);
    if (!call || call.acceptingCalls) {
      return;
    }
    call.acceptingCalls = true;
    if (call.status === "idle") {
      this.startTimer(call, Config.Call.FirstCallDelaySeconds, () => this.ring(playerId, call));
    }
  }

  /** Stops new calls, e.g. when the shift timer runs out. A call in progress carries on; one
   * that's still ringing counts as missed. */
  stopCalls(playerId: string): void {
    const call = this.calls.get(playerId);
    if (!call) {
      return;
    }
    call.acceptingCalls = false;
    if (call.status === "idle") {
      this.cancelTimer(call);
    } else if (call.status === "ringing") {
      this.endCall(playerId, call, "missed");
    }
  }

  /** Ends the call in progress right away with `reason`, e.g. when the player goes quiet in
   * overtime. Returns whether there was one. */
  forceHangUp(playerId: string, reason: CallEndReason): boolean {
    const call = this.calls.get(playerId);
    if (call?.status !== "inCall") {
      return false;
    }
    this.endCall(playerId, call, reason);
    return true;
  }

  isInCall(playerId: string): boolean {
    return this.calls.get(playerId)?.status === "inCall";
  }

  /** True while it's the player's turn to talk in a call. */
  isPlayerTurn(playerId: string): boolean {
    const call = this.calls.get(playerId);
    return call?.status === "inCall" && call.turn === "playerTurn";
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
    this.speak(playerId, call, { text: greeting, endAfter: null });
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
    const testReply = this.allowTestWords ? matchTestWord(cleaned) : null;
    call.playerTurns += 1;
    this.addMessage(call, { speaker: "player", text: cleaned });
    call.turn = "processing";
    this.publish(playerId, call);
    this.listener?.turnChanged(playerId);

    // Waiting on the reply is the processing turn. Hanging up cancels this timer, and the
    // check makes sure a reply never lands on a call that has moved on.
    this.startTimer(call, Config.Turn.ThinkingSeconds, () => {
      if (call.callId !== callId || call.status !== "inCall" || call.turn !== "processing") {
        return;
      }
      const reply = testReply ?? this.takeFallbackReply(call, scenario);
      this.speak(
        playerId,
        call,
        this.decideLine(playerId, call, scenario, reply, testReply !== null),
      );
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
    call.suspicion = call.scenario.startingSuspicion;
    call.code = null;
    call.endAfterLine = null;
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
    if (call.acceptingCalls) {
      this.startTimer(call, Config.Call.SecondsBetweenCalls, () => this.ring(playerId, call));
    } else {
      this.cancelTimer(call);
    }
    this.publish(playerId, call);
    this.listener?.callEnded(playerId, reason);
  }

  /** Applies a reply's suspicion change and decides what the victim says: the reply, plus
   * the code, an angry hang-up or a "not yet". The server makes every one of these calls; a
   * reply can only suggest a reveal. Test words skip Config.Call.MinTurnsBeforeReveal. */
  private decideLine(
    playerId: string,
    call: PlayerCall,
    scenario: Scenario,
    reply: AIReply,
    isTest: boolean,
  ): Line {
    const { lines } = scenario;
    // Clamped to the per-turn limits and the range inside.
    call.suspicion = applySuspicionChange(call.suspicion, reply.suspicionChange);
    if (call.suspicion >= scenario.suspicionThreshold) {
      return { text: `${reply.reply} ${lines.hangUpLine}`, endAfter: "victimHungUp" };
    }
    if (!reply.revealsCode) {
      return { text: reply.reply, endAfter: null };
    }
    // Reading the code out the first time needs enough trust, and not too early in the
    // call. Once it's out, they'll happily read the same code again.
    const trusting =
      call.suspicion < scenario.trustLevel &&
      (isTest || call.playerTurns >= Config.Call.MinTurnsBeforeReveal);
    if (call.code === null && !trusting) {
      return { text: `${reply.reply} ${lines.notReadyLine}`, endAfter: null };
    }
    if (call.code === null) {
      call.code = this.codes.generateCode(playerId, scenario.codePrefix);
      this.codes.registerGiftCard(playerId, call.code, {
        value: scenario.cardValue,
        difficulty: scenario.difficulty,
      });
    }
    return {
      text: `${reply.reply} ${lines.revealLine.replaceAll("{code}", call.code)}`,
      endAfter: null,
    };
  }

  /** Adds a victim line to the call and starts the victim's turn, which ends in
   * finishVictimTurn when the client reports back, or when the safety timer runs out. */
  private speak(playerId: string, call: PlayerCall, line: Line): void {
    call.lineId += 1;
    const lineId = call.lineId;
    call.lineStartedAt = Date.now();
    call.turn = "victimTurn";
    call.endAfterLine = line.endAfter;
    this.addMessage(call, { speaker: "victim", text: line.text, lineId });
    this.startTimer(call, safetySeconds(line.text), () =>
      this.finishVictimTurn(playerId, call, lineId),
    );
    this.publish(playerId, call);
    this.listener?.turnChanged(playerId);
  }

  /** The one way the victim's turn ends: the victim has finished saying line `lineId`, so
   * the turn goes back to the player, or the call ends if that was their last line. Step 9
   * calls this when real audio finishes. */
  private finishVictimTurn(playerId: string, call: PlayerCall, lineId: number): void {
    if (call.status !== "inCall" || call.turn !== "victimTurn" || call.lineId !== lineId) {
      return;
    }
    if (call.endAfterLine !== null) {
      this.endCall(playerId, call, call.endAfterLine);
      return;
    }
    this.cancelTimer(call);
    call.turn = "playerTurn";
    this.publish(playerId, call);
    this.listener?.turnChanged(playerId);
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
    const inCall = call.status === "inCall" && call.scenario !== null;
    return {
      status: call.status,
      caller: onCall && call.scenario ? call.scenario.persona.name : null,
      turn: call.status === "inCall" ? call.turn : null,
      playerTurns: call.playerTurns,
      trust:
        inCall && call.scenario
          ? trustMeter(call.suspicion, call.scenario.suspicionThreshold, call.scenario.trustLevel)
          : null,
      codeRevealed: inCall && call.code !== null,
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
