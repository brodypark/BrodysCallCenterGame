import { describe, expect, it } from "vitest";
import { ServerConfig } from "@server/config";
import {
  type AuditFacts,
  AuditObjectives,
  auditPassed,
  countPhrase,
  matchAuditTestWord,
  saysWord,
} from "@server/audits/AuditObjectives";

const { Phrase, PhraseTimes, SpeedRunTurns } = ServerConfig.Audit;

function facts(changes: Partial<AuditFacts> = {}): AuditFacts {
  return {
    startTurn: 2,
    playerTurns: 2,
    awaitingReply: false,
    phraseCount: 0,
    saidForbiddenWord: false,
    codeTurn: null,
    codeWasBait: false,
    cardRevealed: false,
    wentRed: false,
    ...changes,
  };
}

describe("countPhrase", () => {
  it("ignores case and punctuation, and counts every time", () => {
    expect(countPhrase("Thank you, for choosing US!", "thank you for choosing us")).toBe(1);
    expect(
      countPhrase(
        "thank you for choosing us. thank you for choosing us",
        "thank you for choosing us",
      ),
    ).toBe(2);
  });

  it("only matches whole words", () => {
    expect(countPhrase("thank you for choosing user", "thank you for choosing us")).toBe(0);
    expect(countPhrase("hello", "")).toBe(0);
  });
});

describe("saysWord", () => {
  it("matches the word and longer words that start with it, in any case", () => {
    expect(saysWord("This is NOT a scam.", "scam")).toBe(true);
    expect(saysWord("total scammer vibes", "scam")).toBe(true);
    expect(saysWord("I love scampi", "scam")).toBe(true);
    expect(saysWord("anti-scam", "scam")).toBe(true);
  });

  it("doesn't match the word inside another", () => {
    expect(saysWord("Mascam", "scam")).toBe(false);
    expect(saysWord("nothing to see", "scam")).toBe(false);
  });
});

describe("the objectives", () => {
  it("sayPhrase needs the phrase PhraseTimes times", () => {
    const say = AuditObjectives.sayPhrase;
    expect(say.task).toContain(Phrase);
    expect(say.won(facts({ phraseCount: PhraseTimes - 1 }))).toBe(false);
    expect(say.won(facts({ phraseCount: PhraseTimes }))).toBe(true);
    expect(say.progress(facts({ phraseCount: PhraseTimes + 3 }))).toBe(
      `${PhraseTimes}/${PhraseTimes}`,
    );
  });

  it("forbiddenWord is lost as soon as the word is said, and needs the code", () => {
    const word = AuditObjectives.forbiddenWord;
    expect(word.lost(facts({ saidForbiddenWord: true }))).toBe(true);
    expect(word.won(facts())).toBe(false);
    expect(word.won(facts({ codeTurn: 3 }))).toBe(true);
    expect(word.fits({ ...call(), codeRevealed: true })).toBe(false);
  });

  it("speedRun counts the victim's answer to the last allowed message", () => {
    const run = AuditObjectives.speedRun;
    const last = 2 + SpeedRunTurns;
    expect(run.lost(facts({ playerTurns: last - 1 }))).toBe(false);
    expect(run.lost(facts({ playerTurns: last, awaitingReply: true }))).toBe(false);
    expect(run.lost(facts({ playerTurns: last }))).toBe(true);
    expect(run.won(facts({ playerTurns: last, codeTurn: last }))).toBe(true);
    expect(run.lost(facts({ playerTurns: last, codeTurn: last }))).toBe(false);
    expect(run.won(facts({ playerTurns: last + 1, codeTurn: last + 1 }))).toBe(false);
  });

  it("upsell only fits a call with a side problem, and needs the card", () => {
    const upsell = AuditObjectives.upsell;
    expect(upsell.fits(call())).toBe(false);
    expect(upsell.fits({ ...call(), hasSideProblem: true })).toBe(true);
    expect(upsell.won(facts({ cardRevealed: true }))).toBe(true);
  });

  it("smoothTalker is lost once trust hits ANGRY", () => {
    const smooth = AuditObjectives.smoothTalker;
    expect(smooth.fits({ ...call(), trust: "angry" })).toBe(false);
    expect(smooth.lost(facts({ wentRed: true }))).toBe(true);
    expect(smooth.won(facts({ codeTurn: 4 }))).toBe(true);
  });

  it("always fails when the victim hangs up", () => {
    const done = facts({ phraseCount: PhraseTimes });
    expect(auditPassed(AuditObjectives.sayPhrase, done, "playerHungUp")).toBe(true);
    expect(auditPassed(AuditObjectives.sayPhrase, done, "victimSaidGoodbye")).toBe(true);
    expect(auditPassed(AuditObjectives.sayPhrase, done, "victimHungUp")).toBe(false);
  });
});

describe("matchAuditTestWord", () => {
  it("reads !audit with or without an objective", () => {
    expect(matchAuditTestWord("!audit")).toBeNull();
    expect(matchAuditTestWord(" !AUDIT  upsell ")).toBe("upsell");
    expect(matchAuditTestWord("!audit nonsense")).toBeUndefined();
    expect(matchAuditTestWord("!audit upsell now")).toBeUndefined();
    expect(matchAuditTestWord("audit")).toBeUndefined();
  });
});

function call(): Parameters<(typeof AuditObjectives)["upsell"]["fits"]>[0] {
  return {
    callId: 1,
    playerTurns: 2,
    codeRevealed: false,
    cardRevealed: false,
    hasSideProblem: false,
    trust: "unsure",
    bait: false,
  };
}

describe("bait callers", () => {
  it("never counts a bait caller's trap code as getting the code", () => {
    const got = facts({ codeTurn: 3, codeWasBait: true });
    expect(AuditObjectives.forbiddenWord.won(got)).toBe(false);
    expect(AuditObjectives.speedRun.won(got)).toBe(false);
    expect(AuditObjectives.smoothTalker.won(got)).toBe(false);
    expect(AuditObjectives.speedRun.won(facts({ codeTurn: 3 }))).toBe(true);
  });
});
