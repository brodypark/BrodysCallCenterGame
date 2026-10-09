// Rings calls and runs each player's calls, keyed by player id, so more players just means
// more entries. Ported from the Roblox CallService. The victim's replies come from the AI
// when it's on (AIService), and from their scenario's scripted replies when it's off, over
// a limit, or fails.
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
//
// On some calls (Config.Card.SideProblemChance) the victim also has a side problem. If the
// player talks them into paying to fix it, they read out a Wobblebucks Card, which the
// server makes and RedeemService charges, under the same rules as the gift card code.

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
import { levelOf } from "@shared/Levels";
import type { PlayerStats } from "@shared/stats";
import { lowerStartingSuspicion } from "@shared/Upgrades";
import type { SandboxCheat } from "@shared/sandbox";
import { matchTestWord } from "@server/prompts/DebugReplies";
import type { ScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import type { HistoryLine } from "@server/prompts/VictimPrompt";
import type { AIReply, Scenario } from "@server/scenarios/scenarioSchema";
import type { VictimReplySource } from "@server/services/AIService";
import { maskCodes } from "@server/services/aiReply";
import type { GiftCardInfo, WobblebucksCardInfo } from "@server/services/RedeemService";
import { applySuspicionChange, trustMeter } from "@server/services/suspicion";

interface PlayerCall {
  status: CallStatus;
  // Goes up by one every time the phone rings, so a reply that arrives late (e.g. from the
  // AI) can tell whether the call it was for is still going.
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
  // Whether the victim has a side problem this call (rolled when it rings).
  hasSideProblem: boolean;
  // Their Wobblebucks Card, once they've read it out. null before that.
  card: string | null;
  // Set while the victim says their last line: how the call ends once they finish.
  endAfterLine: CallEndReason | null;
  // Index of the next scripted reply.
  nextReply: number;
  // Goes up by one for every victim line (never reset), so a late "finished speaking" for an
  // earlier line or call is ignored.
  lineId: number;
  // When the current victim line was sent (Date.now()), so a client can't end it early.
  lineStartedAt: number;
  // The newest line whose voice has been asked for, so each line is only ever voiced (and
  // paid for) once.
  voicedLineId: number;
  // The call in progress, or the last one answered: what the player sees, codes included.
  // The AI gets its own history (aiHistory) without the codes, saying only that one was
  // read out, so a prompt trick can never get it to repeat or change one.
  transcript: {
    callerName: string;
    messages: ChatMessage[];
    endReason: CallEndReason | null;
  } | null;
  // The call as the AI hears it: the latest Config.AI.MaxHistoryLines lines, no codes.
  aiHistory: HistoryLine[];
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
  registerGiftCard: (playerId: string, code: string, card: GiftCardInfo) => void;
  registerWobblebucksCard: (playerId: string, card: string, info: WobblebucksCardInfo) => void;
}

/** Told about calls as they happen. Set by the shift. */
export interface CallListener {
  // A call ended, for any reason.
  callEnded: (playerId: string, reason: CallEndReason) => void;
  // Whose turn it is changed during a call.
  turnChanged: (playerId: string) => void;
}

// What the victim says next, and how the call ends after it (if it does). `heard` is the
// line as the AI's history keeps it, when that differs (no code in it).
interface Line {
  text: string;
  endAfter: CallEndReason | null;
  heard?: string;
}

// Stands in for the reveal line in the AI's history, so it knows the code was read out.
// Plain speech, so the model doesn't copy a stage direction into its own replies.
const CodeReadOutNote = "Oh, here it is! There, I've read you the code on the back.";
// The same for the Wobblebucks Card.
const CardReadOutNote = "And there's my Wobblebucks Card for the fix, all read out.";

export interface CallServiceOptions {
  scenarios: ScenarioRegistry;
  codes: CodeIssuer;
  // Whether the test words (!reveal, !sus, !calm) work. Never in production.
  allowTestWords: boolean;
  // The stats of the save the player is playing: their level picks who can call, and the
  // Smooth Talker perk lowers starting suspicion.
  statsOf: (playerId: string) => PlayerStats;
  // Development commands typed as messages (e.g. !xp); returns true if `text` was one, so
  // it isn't sent to the victim. Never in production.
  devCommand?: (playerId: string, text: string) => boolean;
  // Sends a player their latest snapshot. Called after every change.
  send: (playerId: string, snapshot: CallSnapshot) => void;
  // Where AI replies come from. Left out, every victim uses scripted replies.
  replies?: VictimReplySource;
  // A random number from 0 up to 1. Tests pass a predictable one.
  random?: () => number;
  // Sandbox overrides. Each is left out, or returns null, to play as normal.
  sandbox?: CallOverrides;
}

/** How Sandbox mode bends the normal rules for a player's calls. */
export interface CallOverrides {
  // Who rings next, instead of a random caller unlocked at their level.
  pickScenario: (playerId: string, lastId: string | null) => Scenario | null;
  // Whether the next caller has a side problem, instead of rolling for it.
  sideProblem: (playerId: string) => boolean | null;
  // False for scripted replies even when the AI is on.
  useAI: (playerId: string) => boolean;
  // False when calls only ring when asked (ringNow), never by themselves.
  autoRing: (playerId: string) => boolean;
}

/** What the Sandbox control panel can make a victim do on the player's turn. */
export type CallCheat = SandboxCheat;

export class CallService {
  private readonly calls = new Map<string, PlayerCall>();
  private readonly scenarios: ScenarioRegistry;
  private readonly codes: CodeIssuer;
  private readonly allowTestWords: boolean;
  private readonly send: CallServiceOptions["send"];
  private readonly statsOf: CallServiceOptions["statsOf"];
  private readonly devCommand: NonNullable<CallServiceOptions["devCommand"]>;
  private readonly replies: VictimReplySource | null;
  private readonly random: () => number;
  private readonly overrides: CallOverrides | null;
  private listener: CallListener | null = null;

  constructor(options: CallServiceOptions) {
    this.scenarios = options.scenarios;
    this.codes = options.codes;
    this.allowTestWords = options.allowTestWords;
    this.send = options.send;
    this.statsOf = options.statsOf;
    this.devCommand = options.devCommand ?? (() => false);
    this.replies = options.replies ?? null;
    this.random = options.random ?? Math.random;
    this.overrides = options.sandbox ?? null;
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
      hasSideProblem: false,
      card: null,
      endAfterLine: null,
      nextReply: 0,
      lineId: 0,
      lineStartedAt: 0,
      voicedLineId: 0,
      transcript: null,
      aiHistory: [],
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
    if (call.status === "idle" && this.ringsByItself(playerId)) {
      this.startTimer(call, Config.Call.FirstCallDelaySeconds, () => this.ring(playerId, call));
    }
  }

  /** Whether the next call rings by itself, or only when asked (Sandbox's Ring now). */
  private ringsByItself(playerId: string): boolean {
    return this.overrides?.autoRing(playerId) ?? true;
  }

  /** Rings the next call right away instead of after the usual wait (Sandbox's "Ring now").
   * Only between calls, while calls are on. */
  ringNow(playerId: string): void {
    const call = this.calls.get(playerId);
    if (call?.status === "idle" && call.acceptingCalls) {
      this.ring(playerId, call);
    }
  }

  /** Sets the victim's suspicion on the player's turn (Sandbox's trust slider), kept below
   * the hang-up threshold. Not mid-line or while the AI is answering, which already used the
   * old value. */
  setSuspicion(playerId: string, suspicion: number): void {
    const call = this.calls.get(playerId);
    if (
      call?.status !== "inCall" ||
      call.turn !== "playerTurn" ||
      !call.scenario ||
      !Number.isFinite(suspicion)
    ) {
      return;
    }
    const highest = call.scenario.suspicionThreshold - 1;
    call.suspicion = Math.round(Math.min(Math.max(suspicion, Config.Suspicion.Min), highest));
    this.publish(playerId, call);
  }

  /** Makes the victim read their code or Wobblebucks Card out, or hang up, on the player's
   * turn (Sandbox's live cheats). A reveal makes them trusting enough first; it still goes
   * through the normal rules for making and registering the card. */
  cheat(playerId: string, cheat: CallCheat): void {
    const call = this.calls.get(playerId);
    if (call?.status !== "inCall" || call.turn !== "playerTurn" || !call.scenario) {
      return;
    }
    const scenario = call.scenario;
    if (cheat === "hangUp") {
      this.speak(
        playerId,
        call,
        { text: scenario.lines.hangUpLine, endAfter: "victimHungUp" },
        true,
      );
      return;
    }
    if (cheat === "readCard") {
      // Nothing to read without a side problem; with one, the AI is told about it from now on.
      if (!scenario.sideProblem) {
        return;
      }
      call.hasSideProblem = true;
    }
    call.suspicion = Math.max(
      Config.Suspicion.Min,
      Math.min(call.suspicion, scenario.trustLevel - 1),
    );
    const reply: AIReply = {
      reply: "",
      suspicionChange: 0,
      revealsCode: cheat === "readCode",
      revealsCard: cheat === "readCard",
    };
    this.speak(playerId, call, this.decideLine(playerId, call, scenario, reply, true), true);
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

  /** Who's ringing or on the line, or null between calls. */
  currentScenario(playerId: string): Scenario | null {
    const call = this.calls.get(playerId);
    return call && call.status !== "idle" ? call.scenario : null;
  }

  isInCall(playerId: string): boolean {
    return this.calls.get(playerId)?.status === "inCall";
  }

  /** True while it's the player's turn to talk in a call. */
  isPlayerTurn(playerId: string): boolean {
    const call = this.calls.get(playerId);
    return call?.status === "inCall" && call.turn === "playerTurn";
  }

  /** The victim line `lineId` and the voice to say it in, if it's the line being said right
   * now and its voice hasn't been asked for yet. Each line is handed out once, so a client
   * can't make the server pay to voice the same line twice. */
  claimLineForVoice(
    playerId: string,
    lineId: number,
  ): { text: string; voice: Scenario["voice"] } | null {
    const call = this.calls.get(playerId);
    if (
      call?.status !== "inCall" ||
      call.turn !== "victimTurn" ||
      call.scenario === null ||
      call.lineId !== lineId ||
      call.voicedLineId === lineId
    ) {
      return null;
    }
    const line = call.transcript?.messages.at(-1);
    if (line?.speaker !== "victim" || line.lineId !== lineId) {
      return null;
    }
    call.voicedLineId = lineId;
    return { text: line.text, voice: call.scenario.voice };
  }

  /** Forgets a player completely, cancelling anything pending. */
  removePlayer(playerId: string): void {
    const call = this.calls.get(playerId);
    if (call) {
      this.cancelTimer(call);
      this.calls.delete(playerId);
    }
    this.replies?.removePlayer(playerId);
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
    call.aiHistory = [];
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
   * long. The victim replies once the AI has, or after a moment's fake thinking when the
   * reply is scripted (or a test word's). */
  sendMessage(playerId: string, text: string): void {
    const call = this.calls.get(playerId);
    if (call?.status !== "inCall" || call.turn !== "playerTurn" || !call.scenario) {
      return;
    }
    const cleaned = cleanMessage(text);
    if (cleaned === null || (this.allowTestWords && this.devCommand(playerId, cleaned))) {
      return;
    }
    const scenario = call.scenario;
    const callId = call.callId;
    const testReply = this.allowTestWords ? matchTestWord(cleaned) : null;
    call.playerTurns += 1;
    this.addMessage(call, { speaker: "player", text: cleaned });
    // A player repeating their code back mustn't put it in front of the AI.
    this.remember(call, { speaker: "player", text: maskCodes(cleaned, scenario.codePrefix) });
    call.turn = "processing";
    this.publish(playerId, call);
    this.listener?.turnChanged(playerId);

    const useAI = this.overrides?.useAI(playerId) ?? true;
    if (testReply === null && this.replies && useAI && !Config.AI.UseScriptedReplies) {
      // A guard in case the reply never comes (AIService always answers by its deadline):
      // say a scripted line instead. Whichever comes second finds the turn has moved on.
      this.startTimer(call, Config.AI.ReplyGuardSeconds, () => {
        if (call.callId === callId && call.status === "inCall" && call.turn === "processing") {
          this.speak(
            playerId,
            call,
            this.decideLine(
              playerId,
              call,
              scenario,
              this.takeFallbackReply(call, scenario),
              false,
            ),
            true,
          );
        }
      });
      void this.replyFromAI(playerId, call, scenario, this.replies);
      return;
    }
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
        true,
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

  /** Asks the AI for the victim's reply, falling back to a scripted one. Ending the call
   * stops the request (endCall), and a reply that arrives after the call has moved on is
   * dropped. */
  private async replyFromAI(
    playerId: string,
    call: PlayerCall,
    scenario: Scenario,
    replies: VictimReplySource,
  ): Promise<void> {
    const callId = call.callId;
    const stillWanted = (): boolean =>
      this.calls.get(playerId) === call &&
      call.callId === callId &&
      call.status === "inCall" &&
      call.turn === "processing";
    let reply: AIReply | null;
    try {
      reply = await replies.getReply({
        playerId,
        scenario,
        history: [...call.aiHistory],
        context: {
          suspicion: call.suspicion,
          playerTurns: call.playerTurns,
          codeRevealed: call.code !== null,
          sideProblem:
            call.hasSideProblem && scenario.sideProblem
              ? {
                  description: scenario.sideProblem.description,
                  spendingLimit: scenario.sideProblem.spendingLimit,
                }
              : null,
          cardRevealed: call.card !== null,
        },
        stillWanted,
      });
    } catch {
      // getReply shouldn't reject; if it does, the victim just says a scripted line.
      reply = null;
    }
    if (!stillWanted()) {
      return;
    }
    this.speak(
      playerId,
      call,
      this.decideLine(
        playerId,
        call,
        scenario,
        reply ?? this.takeFallbackReply(call, scenario),
        false,
      ),
      // The AI didn't answer (an error, a limit, a safety block), so it's a scripted line.
      reply === null,
    );
  }

  private ring(playerId: string, call: PlayerCall): void {
    call.callId += 1;
    const stats = this.statsOf(playerId);
    const lastId = call.scenario?.id ?? null;
    call.scenario =
      this.overrides?.pickScenario(playerId, lastId) ??
      this.scenarios.pick(levelOf(stats.xp), lastId, this.random);
    call.status = "ringing";
    call.nextReply = 0;
    // The Smooth Talker perk. It never takes a victim below their trust level, so nobody
    // starts out ready to read their code.
    const start = call.scenario.startingSuspicion;
    const floor = Math.max(Config.Suspicion.Min, Math.min(start, call.scenario.trustLevel));
    call.suspicion = Math.max(floor, start - lowerStartingSuspicion(stats));
    call.code = null;
    // Scripted victims never bring theirs up; only the AI (or !card) does.
    const sideProblem =
      this.overrides?.sideProblem(playerId) ?? this.random() < Config.Card.SideProblemChance;
    call.hasSideProblem = call.scenario.sideProblem !== undefined && sideProblem;
    call.card = null;
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
    // Stops a reply still on its way from the AI, and logs what the call used.
    this.replies?.callEnded(playerId);
    // Also cancels whatever the call was waiting on (a reply or a line being said).
    if (call.acceptingCalls && this.ringsByItself(playerId)) {
      this.startTimer(call, Config.Call.SecondsBetweenCalls, () => this.ring(playerId, call));
    } else {
      this.cancelTimer(call);
    }
    this.publish(playerId, call);
    this.listener?.callEnded(playerId, reason);
  }

  /** Applies a reply's suspicion change and decides what the victim says: the reply, plus
   * the code and/or Wobblebucks Card, an angry hang-up or a "not yet". The server makes
   * every one of these calls; a reply can only suggest a reveal. Test words skip
   * Config.Call.MinTurnsBeforeReveal, and !card works on a call without a side problem.
   * A reply that says goodbye (hangsUp) ends the call after the line, whatever the trust. */
  private decideLine(
    playerId: string,
    call: PlayerCall,
    scenario: Scenario,
    reply: AIReply,
    isTest: boolean,
  ): Line {
    // Clamped to the per-turn limits and the range inside.
    call.suspicion = applySuspicionChange(call.suspicion, reply.suspicionChange);
    if (call.suspicion >= scenario.suspicionThreshold) {
      return { text: `${reply.reply} ${scenario.lines.hangUpLine}`, endAfter: "victimHungUp" };
    }
    const line = this.decideReveals(playerId, call, scenario, reply, isTest);
    return reply.hangsUp === true ? { ...line, endAfter: "victimSaidGoodbye" } : line;
  }

  /** The reply below the hang-up threshold, plus any card the server lets them read. */
  private decideReveals(
    playerId: string,
    call: PlayerCall,
    scenario: Scenario,
    reply: AIReply,
    isTest: boolean,
  ): Line {
    const { lines } = scenario;
    // Only a victim with a side problem (and a card for it) has anything to pay with.
    const sideProblem = scenario.sideProblem;
    const offersCard =
      reply.revealsCard === true && sideProblem !== undefined && (call.hasSideProblem || isTest);
    if (!reply.revealsCode && !offersCard) {
      return { text: reply.reply, endAfter: null };
    }
    // Reading a card out the first time needs enough trust, and not too early in the call.
    // Once a card is out, they'll happily read it again, and it's the same card.
    const trusting =
      call.suspicion < scenario.trustLevel &&
      (isTest || call.playerTurns >= Config.Call.MinTurnsBeforeReveal);
    if (reply.revealsCode && call.code === null && trusting) {
      call.code = this.codes.generateCode(playerId, scenario.codePrefix);
      this.codes.registerGiftCard(playerId, call.code, {
        value: scenario.cardValue,
        difficulty: scenario.difficulty,
        scenarioId: scenario.id,
      });
    }
    if (offersCard && call.card === null && trusting) {
      call.card = this.codes.generateCode(playerId, Config.Card.Prefix);
      this.codes.registerWobblebucksCard(playerId, call.card, {
        spendingLimit: sideProblem.spendingLimit,
        difficulty: scenario.difficulty,
        scenarioId: scenario.id,
      });
    }
    const code = reply.revealsCode ? call.code : null;
    const card = offersCard ? call.card : null;
    if (code === null && card === null) {
      // They offered to read a card, but the server says not yet.
      return { text: `${reply.reply} ${lines.notReadyLine}`, endAfter: null };
    }
    const said = [reply.reply];
    const heard = [reply.reply];
    if (code !== null) {
      said.push(lines.revealLine.replaceAll("{code}", code));
      heard.push(CodeReadOutNote);
    }
    if (card !== null && sideProblem) {
      said.push(sideProblem.cardLine.replaceAll("{card}", card));
      heard.push(CardReadOutNote);
    }
    // A cheat's reply is empty: the line is just the card.
    const join = (parts: string[]): string => parts.filter((part) => part !== "").join(" ");
    return { text: join(said), endAfter: null, heard: join(heard) };
  }

  /** Adds a victim line to the call and starts the victim's turn, which ends in
   * finishVictimTurn when the client reports back, or when the safety timer runs out.
   * `scripted` marks a reply that didn't come from the AI, so the chat can say so. */
  private speak(playerId: string, call: PlayerCall, line: Line, scripted = false): void {
    call.lineId += 1;
    const lineId = call.lineId;
    call.lineStartedAt = Date.now();
    call.turn = "victimTurn";
    call.endAfterLine = line.endAfter;
    this.addMessage(call, {
      speaker: "victim",
      text: line.text,
      lineId,
      ...(scripted ? { scripted: true } : {}),
    });
    this.remember(call, { speaker: "victim", text: line.heard ?? line.text });
    this.startTimer(call, safetySeconds(line.text), () =>
      this.finishVictimTurn(playerId, call, lineId),
    );
    this.publish(playerId, call);
    this.listener?.turnChanged(playerId);
  }

  /** The one way the victim's turn ends: the victim has finished saying line `lineId`, so
   * the turn goes back to the player, or the call ends if that was their last line. The
   * client reports it when the line's audio finishes. */
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

  /** Adds a line to the AI's history, keeping only the latest Config.AI.MaxHistoryLines. */
  private remember(call: PlayerCall, line: HistoryLine): void {
    call.aiHistory.push(line);
    if (call.aiHistory.length > Config.AI.MaxHistoryLines) {
      call.aiHistory.splice(0, call.aiHistory.length - Config.AI.MaxHistoryLines);
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
      face: onCall && call.scenario ? call.scenario.face : null,
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
