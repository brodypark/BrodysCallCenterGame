import type { GameMode } from "@shared/sandbox";
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
  // True when the reply came from the scenario's script (or a test word or Sandbox cheat)
  // rather than the AI. Greetings are always scripted, so they aren't marked.
  scripted?: boolean;
}

export type ChatMessage = PlayerMessage | VictimMessage;

// victimHungUp: suspicion reached the scenario's threshold. victimSaidGoodbye: they ended the
// call on friendly terms. shiftEnded: cut off in overtime for staying quiet too long.
export type CallEndReason =
  "playerHungUp" | "victimHungUp" | "victimSaidGoodbye" | "shiftEnded" | "declined" | "missed";

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

export type HairStyle = "Bun" | "Long" | "Short" | "Bald";
export type HatStyle = "Tricorn" | "TinFoil" | "Deerstalker" | "Headband";
export type FacialHair = "Mustache" | "Beard";

/** How a victim's cartoon face is drawn (ui/Face). Colors are like "#ffdcbe". */
export interface FaceLook {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  glasses: boolean;
  earrings: boolean;
  // Rosy cheeks.
  blush: boolean;
  // Extras; left out for none.
  hat?: { style: HatStyle; color: string };
  // Drawn in the hair color. A beard comes with a mustache.
  facialHair?: FacialHair;
  // Over the left eye.
  eyepatch?: boolean;
  antennae?: boolean;
}

/** Everything the client knows about the player's calls. Sent whenever any of it changes. */
export interface CallSnapshot {
  status: CallStatus;
  // Who's calling, or on the line. null while idle.
  caller: string | null;
  // How the caller looks. null while idle.
  face: FaceLook | null;
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
  // The player's new level, if this shift's XP took them up (one or more). null if not.
  newLevel: number | null;
  // Names of the callers that going up unlocked. Empty if none did.
  unlockedCallers: string[];
  // Skibidi's live audits this shift: passed (bonus paid) and failed (quota raised).
  auditsPassed: number;
  auditsFailed: number;
  // The player cashed in a bait caller's trap code: the shift failed on the spot.
  hacked: boolean;
  // Taken from the bank for getting hacked. 0 if they weren't.
  fine: number;
}

/** A bait caller's trap was sprung: the screen is hacked for `seconds`, and `fine` was taken
 * from the bank. */
export interface HackInfo {
  seconds: number;
  fine: number;
  // False in Sandbox, which has no shift (and no fine).
  shiftFailed: boolean;
}

// What a hint on a caller's page is about: what wins them over, what makes them angry, their
// running gag, and the most their Wobblebucks Card can be charged.
export type CallerHintKind = "likes" | "dislikes" | "obsession" | "spendingLimit";

export interface CallerHint {
  kind: CallerHintKind;
  // The hint, or null until it's earned.
  text: string | null;
  // How many more of the caller's gift cards to cash in (Wobblebucks Cards to charge, for
  // the spending limit) to earn it. 0 once it's earned.
  remaining: number;
}

/** A caller the player hasn't reached yet: only their name and when they unlock. */
export interface LockedCallerPage {
  unlocked: false;
  id: string;
  name: string;
  unlockLevel: number;
}

/** A caller who can call the player. */
export interface UnlockedCallerPage {
  unlocked: true;
  id: string;
  name: string;
  unlockLevel: number;
  difficulty: Difficulty;
  face: FaceLook;
  bio: string;
  // What their gift card pays.
  cardValue: number;
  // Their gift cards the player has cashed in.
  scams: number;
  hints: CallerHint[];
}

export type CallerPage = LockedCallerPage | UnlockedCallerPage;

/** The Characters app: a page for every caller, in unlock order. Hints and spending limits
 * the player hasn't earned are never in it. */
export interface CharactersSnapshot {
  pages: CallerPage[];
}

/** One email, written out by the server. */
export interface MailMessage {
  id: number;
  from: string;
  subject: string;
  // Plain text; a blank line between paragraphs.
  body: string;
  // When it arrived (milliseconds since 1970, server clock).
  sentAt: number;
  read: boolean;
}

/** The Email app's inbox. */
export interface MailSnapshot {
  // Newest first.
  messages: MailMessage[];
  // An unread email that opens the Email app by itself (the boss's welcome), or null.
  autoOpenId: number | null;
}

// active: still going. passed / failed: graded when the call ended (or lost for sure early).
export type AuditStatus = "active" | "passed" | "failed";

/** Skibidi's live audit on the current call, for the Call window. Kept after the call ends
 * (with its result) until the next one is answered. */
export interface AuditSnapshot {
  // What to do, short, e.g. 'Say "thank you for choosing us" 2 times'.
  task: string;
  // How it's going, e.g. "1/2" or "3 turns left".
  progress: string;
  status: AuditStatus;
}

/** The server's answer to buying or equipping something in the Shop. */
export interface ShopResult {
  success: boolean;
  message: string;
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
  // The slot being played (Config.Saves.SandboxSlot in Sandbox), or null on the title menu.
  activeSlot: number | null;
  // Which way the player is playing, or null before they pick.
  mode: GameMode | null;
}
