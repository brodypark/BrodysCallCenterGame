// Skibidi's live audit objectives: what each one asks for, and plain rules for whether the
// player managed it. AuditService keeps the facts up to date during a call and grades them
// when it ends. Every number comes from ServerConfig.Audit.

import type { CallEndReason, TrustWord } from "@shared/types";
import { ServerConfig } from "@server/config";

export const AuditObjectiveIds = [
  "sayPhrase",
  "forbiddenWord",
  "speedRun",
  "upsell",
  "smoothTalker",
] as const;

export type AuditObjectiveId = (typeof AuditObjectiveIds)[number];

/** Where the call is, as the audit needs it. */
export interface CallProgress {
  // Changes on every call, so an audit never outlives its own.
  callId: number;
  playerTurns: number;
  codeRevealed: boolean;
  cardRevealed: boolean;
  hasSideProblem: boolean;
  trust: TrustWord | null;
}

/** What has happened on the call since the audit arrived. */
export interface AuditFacts {
  // The player's message count when the audit arrived.
  startTurn: number;
  // The player's message count now.
  playerTurns: number;
  // True between the player's message and the victim's answer to it.
  awaitingReply: boolean;
  // How many times the player has said ServerConfig.Audit.Phrase.
  phraseCount: number;
  saidForbiddenWord: boolean;
  // The player's message count when the code was read out, or null if it hasn't been.
  codeTurn: number | null;
  cardRevealed: boolean;
  // True once the trust bar has hit ANGRY.
  wentRed: boolean;
}

export interface AuditObjective {
  id: AuditObjectiveId;
  // Short, for the Call window.
  task: string;
  // Whether it makes sense on this call right now.
  fits: (call: CallProgress) => boolean;
  // How it's going, for the Call window.
  progress: (facts: AuditFacts) => string;
  // Already failed, whatever happens next.
  lost: (facts: AuditFacts) => boolean;
  // Done, if the call ended now (on good terms).
  won: (facts: AuditFacts) => boolean;
}

/** Lowercase words only, with single spaces round them, so "Thank you, for choosing US!"
 * matches "thank you for choosing us" however it was typed or heard. */
function words(text: string): string {
  const plain = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return ` ${plain} `;
}

/** How many times `phrase` is in `text`, ignoring case and punctuation. */
export function countPhrase(text: string, phrase: string): number {
  const needle = words(phrase);
  if (needle.trim() === "") {
    return 0;
  }
  const haystack = words(text);
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) {
      return count;
    }
    count += 1;
    // Keeps the space at the end, so the next match can start right after it.
    from = at + needle.length - 1;
  }
}

/** Whether `text` has a word starting with `word` ("scams" and "scammer" count for "scam"). */
export function saysWord(text: string, word: string): boolean {
  const start = words(word).trim();
  return (
    start !== "" &&
    words(text)
      .trim()
      .split(" ")
      .some((each) => each.startsWith(start))
  );
}

const { Phrase, PhraseTimes, ForbiddenWord, SpeedRunTurns } = ServerConfig.Audit;

// The player's messages since the audit arrived.
const turnsUsed = (facts: AuditFacts): number => facts.playerTurns - facts.startTurn;
// Turns of the speed run the code took, or null if it hasn't been read out.
const codeTurns = (facts: AuditFacts): number | null =>
  facts.codeTurn === null ? null : facts.codeTurn - facts.startTurn;

export const AuditObjectives: Readonly<Record<AuditObjectiveId, AuditObjective>> = {
  sayPhrase: {
    id: "sayPhrase",
    task: `Say "${Phrase}" ${PhraseTimes} times`,
    fits: () => true,
    progress: (facts) => `${Math.min(facts.phraseCount, PhraseTimes)}/${PhraseTimes}`,
    lost: () => false,
    won: (facts) => facts.phraseCount >= PhraseTimes,
  },
  forbiddenWord: {
    id: "forbiddenWord",
    task: `Get the code without saying "${ForbiddenWord}"`,
    fits: (call) => !call.codeRevealed,
    progress: (facts) => {
      if (facts.saidForbiddenWord) {
        return "You said it";
      }
      return facts.codeTurn === null ? "Clean so far" : "Clean, code got";
    },
    lost: (facts) => facts.saidForbiddenWord,
    won: (facts) => !facts.saidForbiddenWord && facts.codeTurn !== null,
  },
  speedRun: {
    id: "speedRun",
    task: `Get the code within ${SpeedRunTurns} messages`,
    fits: (call) => !call.codeRevealed,
    progress: (facts) => {
      if (facts.codeTurn !== null) {
        return "Code got";
      }
      const left = Math.max(SpeedRunTurns - turnsUsed(facts), 0);
      return `${left} ${left === 1 ? "message" : "messages"} left`;
    },
    // While the victim is still answering the last allowed message, their reply can count.
    lost: (facts) => {
      const took = codeTurns(facts);
      if (took !== null) {
        return took > SpeedRunTurns;
      }
      const used = turnsUsed(facts);
      return facts.awaitingReply ? used > SpeedRunTurns : used >= SpeedRunTurns;
    },
    won: (facts) => {
      const took = codeTurns(facts);
      return took !== null && took <= SpeedRunTurns;
    },
  },
  upsell: {
    id: "upsell",
    task: "Upsell: get their Wobblebucks Card too",
    // Only when there's a side problem to charge for.
    fits: (call) => call.hasSideProblem && !call.cardRevealed,
    progress: (facts) => (facts.cardRevealed ? "Card got" : "No card yet"),
    lost: () => false,
    won: (facts) => facts.cardRevealed,
  },
  smoothTalker: {
    id: "smoothTalker",
    task: "Get the code without trust hitting ANGRY",
    fits: (call) => !call.codeRevealed && call.trust !== "angry",
    progress: (facts) => {
      if (facts.wentRed) {
        return "They got angry";
      }
      return facts.codeTurn === null ? "Calm so far" : "Calm, code got";
    },
    lost: (facts) => facts.wentRed,
    won: (facts) => !facts.wentRed && facts.codeTurn !== null,
  },
};

export function isAuditObjectiveId(id: string): id is AuditObjectiveId {
  return (AuditObjectiveIds as readonly string[]).includes(id);
}

/** Whether the audit passed, for a call that ended with `reason`. Being hung up on always
 * fails it. */
export function auditPassed(
  objective: AuditObjective,
  facts: AuditFacts,
  reason: CallEndReason,
): boolean {
  return reason !== "victimHungUp" && !objective.lost(facts) && objective.won(facts);
}

// The test word that forces an audit onto the current call (development only), optionally
// followed by an objective id, e.g. "!audit upsell".
const TestWord = "!audit";

/** For "!audit" or "!audit <id>": the objective asked for (null for any). undefined if
 * `text` isn't the test word, or names an objective that doesn't exist. */
export function matchAuditTestWord(text: string): AuditObjectiveId | null | undefined {
  const [word, id, ...rest] = text.trim().split(/\s+/);
  if (word?.toLowerCase() !== TestWord || rest.length > 0) {
    return undefined;
  }
  if (id === undefined) {
    return null;
  }
  return isAuditObjectiveId(id) ? id : undefined;
}
