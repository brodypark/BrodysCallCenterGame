import { beforeEach, describe, expect, it } from "vitest";
import { totalXpFor } from "@shared/Levels";
import { PlayerStatsSchema } from "@shared/stats";
import type { MailSnapshot, ShiftResult } from "@shared/types";
import { ServerConfig } from "@server/config";
import { StoryChapters, writeMail } from "@server/mail/MailTemplates";
import { AllScenarios } from "@server/scenarios/all";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import { levelMail, MailService } from "@server/services/MailService";
import type { ShiftSummary } from "@server/services/ShiftService";
import { defaultStats, StatsService } from "@server/services/StatsService";

const PlayerId = "player-1";
const scenarios = createScenarioRegistry(AllScenarios);
const Now = 1_700_000_000_000;

let stats: StatsService;
let mail: MailService;
let campaign: boolean;
let sent: MailSnapshot[];

function result(passed: boolean, newLevel: number | null = null): ShiftResult {
  return {
    passed,
    earnings: 0,
    quota: 0,
    callsTaken: 0,
    successfulCalls: 0,
    xpEarned: 0,
    newLevel,
    unlockedCallers: [],
    auditsPassed: 0,
    auditsFailed: 0,
  };
}

function summary(changes: Partial<ShiftSummary> = {}): ShiftSummary {
  return { result: result(false), levelBefore: 1, endings: {}, ...changes };
}

/** Ends a shift the way ShiftService does: results saved first, then the mail. */
function endShift(shift: ShiftSummary): void {
  stats.update(PlayerId, (current) => {
    if (shift.result.passed) {
      current.shiftsPassed += 1;
    } else {
      current.shiftsFailed += 1;
    }
  });
  mail.shiftEnded(PlayerId, shift);
}

function templates(): string[] {
  return stats.get(PlayerId).mail.inbox.map((entry) => entry.template);
}

function subjects(): string[] {
  return mail.snapshot(PlayerId).messages.map((message) => message.subject);
}

beforeEach(() => {
  campaign = true;
  sent = [];
  stats = new StatsService({ send: () => mail.publish(PlayerId), save: () => undefined });
  mail = new MailService({
    scenarios,
    stats,
    isCampaign: () => campaign,
    send: (_playerId, snapshot) => sent.push(snapshot),
    now: () => Now,
  });
  stats.load(PlayerId, defaultStats());
});

describe("MailService: the welcome", () => {
  it("welcomes a Campaign save the first time it's played, and opens it by itself", () => {
    mail.savePicked(PlayerId);
    mail.savePicked(PlayerId);
    expect(templates()).toEqual(["welcome"]);
    const snapshot = mail.snapshot(PlayerId);
    expect(snapshot.messages[0]?.from).toContain("Chad");
    expect(snapshot.autoOpenId).toBe(snapshot.messages[0]?.id);
    expect(sent.at(-1)?.messages).toHaveLength(1);
  });

  it("stops opening by itself once it's read", () => {
    mail.savePicked(PlayerId);
    const id = mail.snapshot(PlayerId).messages[0]?.id ?? -1;
    mail.read(PlayerId, id);
    expect(mail.snapshot(PlayerId)).toMatchObject({ autoOpenId: null, messages: [{ read: true }] });
  });

  it("catches up a save that was played before email: the story so far, then a welcome back", () => {
    stats.load(PlayerId, { ...defaultStats(), xp: totalXpFor(5), shiftsPassed: 4 });
    mail.savePicked(PlayerId);
    const reached = StoryChapters.filter((chapter) => chapter.level <= 5);
    expect(templates()).toEqual([...reached.map(() => "story"), "welcomeBack"]);
    const snapshot = mail.snapshot(PlayerId);
    expect(snapshot.messages[0]?.subject).toBe("Your inbox is finally working!");
    expect(snapshot.messages[0]?.body).toContain(`all ${reached.length} back issues`);
    expect(snapshot.autoOpenId).toBe(snapshot.messages[0]?.id);
  });

  it("gives a fresh save the first-day welcome even if its first visit was a while ago", () => {
    mail.savePicked(PlayerId);
    expect(templates()).toEqual(["welcome"]);
  });

  it("sends no mail in Sandbox", () => {
    campaign = false;
    mail.savePicked(PlayerId);
    mail.learned(PlayerId, "grandma");
    mail.shiftEnded(PlayerId, summary());
    expect(stats.get(PlayerId).mail.inbox).toEqual([]);
  });
});

describe("MailService: reading", () => {
  it("ignores emails that don't exist", () => {
    mail.savePicked(PlayerId);
    const before = stats.get(PlayerId);
    mail.read(PlayerId, 999);
    expect(stats.get(PlayerId)).toEqual(before);
  });

  it("lists the newest email first, keeping the order of emails sent together", () => {
    mail.savePicked(PlayerId);
    endShift(summary({ result: result(false), endings: { declined: 5 } }));
    expect(subjects()).toEqual([
      "The phone is not decorative",
      "Quick chat about your last shift :)",
      "Welcome to the team, superstar!",
    ]);
  });

  it("keeps only the newest ServerConfig.Mail.MaxInbox emails", () => {
    for (let shift = 0; shift < ServerConfig.Mail.MaxInbox + 5; shift += 1) {
      endShift(summary());
    }
    const { inbox } = stats.get(PlayerId).mail;
    expect(inbox).toHaveLength(ServerConfig.Mail.MaxInbox);
    expect(inbox.at(-1)?.id).toBe(ServerConfig.Mail.MaxInbox + 4);
  });
});

describe("MailService: shifts", () => {
  it("escalates as failed shifts pile up, and a pass resets it", () => {
    endShift(summary());
    endShift(summary());
    endShift(summary());
    endShift(summary());
    expect(templates()).toEqual([
      "shiftFailed",
      "shiftFailedAgain",
      "improvementPlan",
      "improvementPlan",
    ]);
    expect(subjects()).toContain("Performance Improvement Plan (mandatory)");
    expect(mail.snapshot(PlayerId).messages[0]?.body).toContain("4 shifts in a row");

    endShift(summary({ result: result(true) }));
    endShift(summary());
    expect(templates().slice(-2)).toEqual(["firstPass", "shiftFailed"]);
  });

  it("only celebrates the first pass", () => {
    endShift(summary({ result: result(true) }));
    endShift(summary({ result: result(true) }));
    expect(templates()).toEqual(["firstPass"]);
  });

  it("warns about hang-ups and ignored calls from the thresholds up", () => {
    const { HungUpOnWarning, HangingUpWarning, IgnoredCallsWarning } = ServerConfig.Mail;
    endShift(
      summary({
        result: result(true),
        endings: {
          victimHungUp: HungUpOnWarning - 1,
          playerHungUp: HangingUpWarning - 1,
          missed: IgnoredCallsWarning - 1,
        },
      }),
    );
    expect(templates()).toEqual(["firstPass"]);

    endShift(
      summary({
        result: result(true),
        endings: {
          victimHungUp: HungUpOnWarning,
          playerHungUp: HangingUpWarning,
          missed: 1,
          declined: IgnoredCallsWarning - 1,
        },
      }),
    );
    expect(templates().slice(1)).toEqual(["hungUpOn", "hangingUp", "ignoredCalls"]);
  });

  it("sends one case file update per shift for the callers whose pages gained hints", () => {
    mail.learned(PlayerId, "grandma");
    mail.learned(PlayerId, "hudson");
    mail.learned(PlayerId, "grandma");
    endShift(summary({ result: result(true) }));
    const intel = mail
      .snapshot(PlayerId)
      .messages.find((each) => each.subject === "Case file update");
    expect(intel?.body).toContain("Grandma Gertrude and Hudson");
    expect(stats.get(PlayerId).mail.pendingIntel).toEqual([]);

    endShift(summary({ result: result(true) }));
    expect(templates().filter((each) => each === "intel")).toHaveLength(1);
  });

  it("sends the level emails after the rest", () => {
    endShift(summary({ result: result(true, 2), levelBefore: 1 }));
    expect(templates()).toEqual(["firstPass", "newLead", "newLead", "story"]);
    expect(subjects()[0]).toBe("The Trust Fall, Issue #1: Meet the Office");
  });
});

describe("levelMail", () => {
  it("introduces each caller on the level they unlock", () => {
    const hudson = scenarios.get("hudson");
    const level = hudson?.unlockLevel ?? 0;
    expect(levelMail(level - 1, level, scenarios)).toContainEqual({
      template: "newLead",
      vars: { scenarioId: "hudson", level },
    });
  });

  it("brings each story chapter on its level", () => {
    for (const [index, chapter] of StoryChapters.entries()) {
      expect(levelMail(chapter.level - 1, chapter.level, scenarios)).toContainEqual({
        template: "story",
        vars: { level: chapter.level },
      });
      expect(writeMail("story", { level: chapter.level }, scenarios)?.subject).toContain(
        `Issue #${index + 1}:`,
      );
    }
  });

  it("sends a high five for a level with nothing else", () => {
    const pastEverything =
      Math.max(
        ...StoryChapters.map((chapter) => chapter.level),
        ...AllScenarios.map((each) => each.unlockLevel),
      ) + 1;
    expect(levelMail(pastEverything - 1, pastEverything, scenarios)).toEqual([
      { template: "promotion", vars: { level: pastEverything } },
    ]);
  });

  it("sends an email for every level when several are gained at once", () => {
    expect(levelMail(1, 4, scenarios).length).toBeGreaterThanOrEqual(3);
  });
});

describe("MailTemplates", () => {
  it("writes every story chapter, in level order", () => {
    const levels = StoryChapters.map((chapter) => chapter.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    for (const chapter of StoryChapters) {
      expect(writeMail("story", { level: chapter.level }, scenarios)?.body).toContain(chapter.body);
    }
  });

  it("skips emails it can't write", () => {
    expect(writeMail("removedTemplate", {}, scenarios)).toBeNull();
    expect(writeMail("newLead", { scenarioId: "nobody", level: 3 }, scenarios)).toBeNull();
    expect(writeMail("story", { level: 1 }, scenarios)).toBeNull();
    expect(writeMail("hungUpOn", {}, scenarios)).toBeNull();
  });

  it("starts a mailbox over, rather than breaking the save, if it can't be read", () => {
    const parsed = PlayerStatsSchema.parse({ money: 5, mail: { inbox: [{ broken: true }] } });
    expect(parsed.mail).toEqual(defaultStats().mail);
    expect(parsed.money).toBe(5);
  });

  it("doesn't trip over template names that are Object properties", () => {
    expect(writeMail("toString", {}, scenarios)).toBeNull();
  });

  it("writes Skibidi's audit emails, and drops ones it can't make sense of", () => {
    const assigned = writeMail(
      "auditAssigned",
      { objective: "sayPhrase", money: 25, xp: 20, raise: 25 },
      scenarios,
    );
    expect(assigned?.from).toContain("Skibidi");
    expect(assigned?.body).toContain(ServerConfig.Audit.Phrase);
    expect(
      writeMail("auditFailed", { objective: "speedRun", raise: 25, quota: 175 }, scenarios)?.body,
    ).toContain("$175");
    expect(
      writeMail("auditPassed", { objective: "upsell", money: 25, xp: 20 }, scenarios)?.subject,
    ).toContain("PASSED");
    expect(
      writeMail("auditAssigned", { objective: "nope", money: 1, xp: 1, raise: 1 }, scenarios),
    ).toBeNull();
    expect(writeMail("auditPassed", { objective: "upsell" }, scenarios)).toBeNull();
    expect(
      writeMail("auditFailed", { objective: "upsell", sandbox: 1 }, scenarios)?.body,
    ).toContain("Sandbox");
  });
});

describe("MailService: sending right away", () => {
  it("delivers in Sandbox too (Skibidi's test-word audits)", () => {
    campaign = false;
    mail.deliverNow(PlayerId, [
      { template: "auditPassed", vars: { objective: "upsell", sandbox: 1 } },
    ]);
    expect(templates()).toEqual(["auditPassed"]);
    expect(subjects()[0]).toContain("PASSED");
  });
});
