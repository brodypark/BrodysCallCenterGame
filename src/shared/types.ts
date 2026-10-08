import type { PlayerStats } from "@shared/stats";

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

// victimHungUp: suspicion reached the scenario's threshold. shiftEnded: cut off in
// overtime for staying quiet too long.
export type CallEndReason = "playerHungUp" | "victimHungUp" | "shiftEnded" | "declined" | "missed";

export type Difficulty = "Easy" | "Medium" | "Hard";

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

// offShift: waiting to clock in. onShift: the timer is running and calls ring. overtime:
// the timer ran out, but the last call (and any code to redeem) is being finished.
export type ShiftStatus = "offShift" | "onShift" | "overtime";

/** What the client is told about the current shift. Times are on the server's clock
 * (milliseconds since 1970), with serverNow so the client can allow for its own clock. */
export interface ShiftSnapshot {
  status: ShiftStatus;
  // Money earned this shift. Only banked if the shift is passed.
  earnings: number;
  quota: number;
  // How long a shift lasts, in seconds.
  lengthSeconds: number;
  // When the shift timer runs out. null off shift.
  endsAt: number | null;
  // In overtime: when the shift (or the call) is cut off if nothing happens first. null
  // while waiting on the victim, and outside overtime.
  overtimeEndsAt: number | null;
  serverNow: number;
}

/** The report card when a shift ends. */
export interface ShiftResult {
  passed: boolean;
  earnings: number;
  quota: number;
  callsTaken: number;
  successfulCalls: number;
  // Kept even when the shift is failed.
  xpEarned: number;
}

export type { PlayerStats } from "@shared/stats";

// empty: nothing saved. ready: can be continued. damaged: the save couldn't be read, so it
// can only be deleted (it's never overwritten).
export type SaveSlotState = "empty" | "ready" | "damaged";

export interface SaveSlotSummary {
  // 1 to Config.Saves.SlotCount.
  slot: number;
  state: SaveSlotState;
  // What the slot's save holds, for the picker. null unless it's ready.
  stats: PlayerStats | null;
  // When it was last saved (milliseconds since 1970). null when empty.
  updatedAt: number | null;
}

/** The player's save slots, and the one this session is playing (null: pick one). */
export interface SavesSnapshot {
  slots: SaveSlotSummary[];
  activeSlot: number | null;
}
