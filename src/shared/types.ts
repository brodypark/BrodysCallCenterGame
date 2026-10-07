// Types the server sends to the client. Anything the player shouldn't see (prompts, codes
// before they're read out, scenario internals) is never part of these.

// Idle: between calls. Ringing: someone is calling. InCall: the player answered.
export type CallStatus = "idle" | "ringing" | "inCall";

export type Speaker = "player" | "victim";

export interface ChatMessage {
  speaker: Speaker;
  text: string;
}

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
  // The call in progress, or the last one answered. null before the first answered call.
  transcript: Transcript | null;
  // How the most recent call ended, missed and declined ones included. null while a call
  // is ringing or in progress, and before the first call.
  lastOutcome: CallEndReason | null;
}
