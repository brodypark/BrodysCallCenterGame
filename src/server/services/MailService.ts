// The Email app: the player's inbox, and what gets sent to it. The boss welcomes a Campaign
// save the first time it's played. When a shift ends, the boss, HR and the Research
// Department have their say: the shift's result, warnings about hang-ups and ignored calls,
// new notes in the case files, and an email for each level gained (a new lead, the next
// newsletter issue, or a high five). Emails are saved as a template id and a few values;
// server/mail/MailTemplates writes them out. Sandbox gets no mail.

import type { MailEntry, PlayerStats } from "@shared/stats";
import type { CallEndReason, MailMessage, MailSnapshot } from "@shared/types";
import { ServerConfig } from "@server/config";
import { levelOf } from "@shared/Levels";
import {
  hasChapterAt,
  type MailTemplateId,
  type MailVars,
  StoryChapters,
  writeMail,
} from "@server/mail/MailTemplates";
import type { ScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import type { ShiftSummary } from "@server/services/ShiftService";
import type { StatsService } from "@server/services/StatsService";

/** An email to send. */
export interface MailDraft {
  template: MailTemplateId;
  vars?: MailVars;
}

/** What the shift's emails need from the player's mailbox. */
export interface ShiftMailContext {
  // This was the first shift the player ever passed.
  firstPass: boolean;
  // Shifts failed in a row, this one included. 0 if it was passed.
  failStreak: number;
  // Callers whose pages gained a hint this shift.
  intel: readonly string[];
}

function endedWith(summary: ShiftSummary, ...reasons: CallEndReason[]): number {
  return reasons.reduce((total, reason) => total + (summary.endings[reason] ?? 0), 0);
}

/** The emails for going from `levelBefore` up to `levelAfter`: for each level, a new lead
 * for each caller it unlocks and the story chapter it brings, or a high five if neither. */
export function levelMail(
  levelBefore: number,
  levelAfter: number,
  scenarios: ScenarioRegistry,
): MailDraft[] {
  const drafts: MailDraft[] = [];
  for (let level = levelBefore + 1; level <= levelAfter; level += 1) {
    const before = drafts.length;
    for (const scenario of scenarios.unlockedBetween(level - 1, level)) {
      drafts.push({ template: "newLead", vars: { scenarioId: scenario.id, level } });
    }
    if (hasChapterAt(level)) {
      drafts.push({ template: "story", vars: { level } });
    }
    if (drafts.length === before) {
      drafts.push({ template: "promotion", vars: { level } });
    }
  }
  return drafts;
}

// The welcomes, which open the Email app by themselves until they're read.
const Welcomes: ReadonlySet<string> = new Set<MailTemplateId>(["welcome", "welcomeBack"]);

/** The first emails a Campaign save gets. A fresh one gets the boss's first-day welcome; one
 * that was being played before email existed gets the story so far, then a welcome back. */
export function welcomeMail(stats: PlayerStats): MailDraft[] {
  const level = levelOf(stats.xp);
  if (level === 1 && stats.shiftsPassed + stats.shiftsFailed === 0) {
    return [{ template: "welcome" }];
  }
  const backIssues = StoryChapters.filter((chapter) => chapter.level <= level);
  return [
    ...backIssues.map((chapter): MailDraft => ({
      template: "story",
      vars: { level: chapter.level },
    })),
    { template: "welcomeBack", vars: { backIssues: backIssues.length } },
  ];
}

/** The emails a shift ending sends, in the order they arrive. */
export function shiftMail(
  summary: ShiftSummary,
  context: ShiftMailContext,
  scenarios: ScenarioRegistry,
): MailDraft[] {
  const drafts: MailDraft[] = [];
  const { result } = summary;
  const { Mail } = ServerConfig;

  if (context.firstPass) {
    drafts.push({ template: "firstPass" });
  } else if (context.failStreak === 1) {
    drafts.push({ template: "shiftFailed" });
  } else if (context.failStreak === 2) {
    drafts.push({ template: "shiftFailedAgain" });
  } else if (context.failStreak > 2) {
    drafts.push({ template: "improvementPlan", vars: { streak: context.failStreak } });
  }

  const hungUpOn = endedWith(summary, "victimHungUp");
  if (hungUpOn >= Mail.HungUpOnWarning) {
    drafts.push({ template: "hungUpOn", vars: { count: hungUpOn } });
  }
  const hangingUp = endedWith(summary, "playerHungUp");
  if (hangingUp >= Mail.HangingUpWarning) {
    drafts.push({ template: "hangingUp", vars: { count: hangingUp } });
  }
  const ignored = endedWith(summary, "declined", "missed");
  if (ignored >= Mail.IgnoredCallsWarning) {
    drafts.push({ template: "ignoredCalls", vars: { count: ignored } });
  }

  if (context.intel.length > 0) {
    drafts.push({ template: "intel", vars: { scenarioIds: context.intel.join(",") } });
  }
  if (result.newLevel !== null) {
    drafts.push(...levelMail(summary.levelBefore, result.newLevel, scenarios));
  }
  return drafts;
}

export interface MailServiceOptions {
  scenarios: ScenarioRegistry;
  stats: StatsService;
  // Only Campaign saves get mail.
  isCampaign: (playerId: string) => boolean;
  send: (playerId: string, snapshot: MailSnapshot) => void;
  now?: () => number;
}

export class MailService {
  private readonly options: MailServiceOptions;
  private readonly now: () => number;

  constructor(options: MailServiceOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  snapshot(playerId: string): MailSnapshot {
    const { inbox } = this.options.stats.get(playerId).mail;
    const messages: MailMessage[] = [];
    for (const entry of inbox) {
      const written = writeMail(entry.template, entry.vars, this.options.scenarios);
      if (written) {
        messages.push({ id: entry.id, ...written, sentAt: entry.sentAt, read: entry.read });
      }
    }
    // Newest first. Emails sent together keep their order (the inbox is oldest first).
    messages.reverse();
    const welcome = inbox.findLast((entry) => Welcomes.has(entry.template) && !entry.read);
    return { messages, autoOpenId: welcome?.id ?? null };
  }

  /** Sends the player their inbox. Call it whenever their stats change. */
  publish(playerId: string): void {
    this.options.send(playerId, this.snapshot(playerId));
  }

  /** The player started playing a save: a Campaign save's first time gets a welcome. */
  savePicked(playerId: string): void {
    if (!this.options.isCampaign(playerId) || this.options.stats.get(playerId).mail.welcomed) {
      return;
    }
    this.options.stats.update(playerId, (stats) => {
      stats.mail.welcomed = true;
      this.deliver(stats, welcomeMail(stats));
    });
  }

  /** The player opened email `id`. */
  read(playerId: string, id: number): void {
    const isUnread = (entry: MailEntry): boolean => entry.id === id && !entry.read;
    if (!this.options.stats.get(playerId).mail.inbox.some(isUnread)) {
      return;
    }
    this.options.stats.update(playerId, (stats) => {
      const entry = stats.mail.inbox.find(isUnread);
      if (entry) {
        entry.read = true;
      }
    });
  }

  /** A hint on `scenarioId`'s page was learned: the Research Department mentions it when the
   * shift ends. */
  learned(playerId: string, scenarioId: string): void {
    if (!this.options.isCampaign(playerId)) {
      return;
    }
    if (this.options.stats.get(playerId).mail.pendingIntel.includes(scenarioId)) {
      return;
    }
    this.options.stats.update(playerId, (stats) => {
      stats.mail.pendingIntel.push(scenarioId);
    });
  }

  /** A shift ended, and its results are saved. */
  shiftEnded(playerId: string, summary: ShiftSummary): void {
    if (!this.options.isCampaign(playerId)) {
      return;
    }
    this.options.stats.update(playerId, (stats) => {
      const { mail } = stats;
      const passed = summary.result.passed;
      mail.failStreak = passed ? 0 : mail.failStreak + 1;
      const context: ShiftMailContext = {
        firstPass: passed && stats.shiftsPassed === 1,
        failStreak: mail.failStreak,
        intel: mail.pendingIntel,
      };
      const drafts = shiftMail(summary, context, this.options.scenarios);
      mail.pendingIntel = [];
      this.deliver(stats, drafts);
    });
  }

  /** Puts `drafts` in the inbox, dropping the oldest emails past ServerConfig.Mail.MaxInbox. */
  private deliver(stats: PlayerStats, drafts: readonly MailDraft[]): void {
    const { mail } = stats;
    const sentAt = this.now();
    for (const draft of drafts) {
      mail.inbox.push({
        id: mail.nextId,
        template: draft.template,
        vars: { ...draft.vars },
        sentAt,
        read: false,
      });
      mail.nextId += 1;
    }
    const extra = mail.inbox.length - ServerConfig.Mail.MaxInbox;
    if (extra > 0) {
      mail.inbox.splice(0, extra);
    }
  }
}
