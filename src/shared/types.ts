// Types the server sends to the client. Anything the player shouldn't see (prompts, codes
// before they're read out, scenario internals) is never part of these.

// Idle: between calls. Ringing: someone is calling. InCall: the player answered.
export type CallStatus = "idle" | "ringing" | "inCall";

// Whose turn it is during a call: the player speaks, the victim thinks, the victim speaks.
export type TurnState = "playerTurn" | "processing" | "victimTurn";

export type Speaker = "player" | "victim";

export interface PlayerMessage {
  speaker: "player";
  text: string;
}

export interface VictimMessage {
  speaker: "victim";
  text: string;
  // Which line this is, so the client can say when it has finished speaking it.
  lineId: number;
}

export type ChatMessage = PlayerMessage | VictimMessage;

// victimHungUp: suspicion reached the scenario's threshold.
export type CallEndReason = "playerHungUp" | "victimHungUp" | "declined" | "missed";

// How the victim feels about the player, shown over the trust bar.
export type TrustWord = "trusting" | "unsure" | "wary" | "angry";

/** The Caller Trust bar, worked out on the server. Percentages from 0 to 100. */
export interface TrustMeter {
  // Full means not suspicious at all; empty means they hang up.
  percent: number;
  word: TrustWord;
  // Trust has to climb past this before they'll read out the code.
  revealAt: number;
}

export interface Transcript {
  callerName: string;
  // Both sides, oldest first.
  messages: readonly ChatMessage[];
  // How this call ended. null while it's still going.
  endReason: CallEndReason | null;
}

/** Everything the client knows about the player's calls. Sent whenever any of it changes. */
export interface CallSnapshot {
  status: CallStatus;
  // Who's calling, or on the line. null while idle.
  caller: string | null;
  // Whose turn it is. null unless a call is in progress.
  turn: TurnState | null;
  // Messages the player has sent this call.
  playerTurns: number;
  // The trust bar. null unless a call is in progress.
  trust: TrustMeter | null;
  // True once the victim has read out this call's code.
  codeRevealed: boolean;
  // The call in progress, or the last one answered. null before the first answered call.
  transcript: Transcript | null;
  // How the most recent call ended, missed and declined ones included. null while a call
  // is ringing or in progress, and before the first call.
  lastOutcome: CallEndReason | null;
}

/** The server's answer to redeeming a code in the Redeem app. */
export interface RedeemResult {
  success: boolean;
  payout: number;
  // Wrong tries left for the card this was about; 0 means it's locked. null when what was
  // typed didn't concern any card.
  triesRemaining: number | null;
  message: string;
}

/** What the client is told about the current shift. Step 5 adds the timer and quota. */
export interface ShiftSnapshot {
  // Money earned this session.
  earnings: number;
}
