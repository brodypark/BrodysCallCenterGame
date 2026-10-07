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

export type CallEndReason = "playerHungUp" | "declined" | "missed";

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
  // The call in progress, or the last one answered. null before the first answered call.
  transcript: Transcript | null;
  // How the most recent call ended, missed and declined ones included. null while a call
  // is ringing or in progress, and before the first call.
  lastOutcome: CallEndReason | null;
}
