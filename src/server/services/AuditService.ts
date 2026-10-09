// Skibidi's live audits: during a Campaign call, Skibidi from Quality Assurance sometimes
// emails the player a side objective (server/audits/AuditObjectives). Each player has at most
// one audit, in memory, keyed by player id.
//
// Right after the player's ServerConfig.Audit.AfterPlayerTurn-th message, a call rolls
// ServerConfig.Audit.Chance, if the shift has room for another audit (MaxPerShift). The
// audit watches what the player says and what the call does, and is graded when the call
// ends: passing pays a bonus into the shift's earnings plus XP; failing raises the shift's
// quota. Either way Skibidi emails the result. A call cut off by the shift ending isn't
// graded. The Call window shows the audit and how it's going; the result stays
// up until the next call is answered.
//
// In Sandbox, audits only start with the "!audit" test word. They're graded and emailed the
// same way, but nothing is riding on them (no shift, so no bonus or quota raise).

import type { GameMode } from "@shared/sandbox";
import type { AuditSnapshot, AuditStatus, CallEndReason } from "@shared/types";
import { ServerConfig } from "@server/config";
import type { MailDraft } from "@server/services/MailService";
import {
  type AuditFacts,
  type AuditObjective,
  type AuditObjectiveId,
  AuditObjectives,
  AuditObjectiveIds,
  auditPassed,
  type CallProgress,
  countPhrase,
  saysWord,
} from "@server/audits/AuditObjectives";

/** What the audits need from the shift (ShiftService). */
export interface AuditShift {
  // Whether the shift will take another audit; counts it if so. `force` (the test word)
  // skips the per-shift limit.
  claimAudit: (playerId: string, force: boolean) => boolean;
  // Whether the shift is still running (on shift or in overtime), so a result can count.
  isOnShift: (playerId: string) => boolean;
  auditPassed: (playerId: string, money: number, xp: number) => void;
  // Returns the new quota, or null off shift.
  auditFailed: (playerId: string, raise: number) => number | null;
}

/** What the audits need from the rest of the game. */
export interface AuditServiceOptions {
  // Where the player's call is, or null if they aren't in one.
  callProgress: (playerId: string) => CallProgress | null;
  // The save being played (null before one is picked). Campaign rolls for audits; Sandbox
  // only gets them from the test word.
  modeOf: (playerId: string) => GameMode | null;
  shift: AuditShift;
  // Sends Skibidi's email now (MailService.deliverNow).
  mail: (playerId: string, draft: MailDraft) => void;
  // Sends the player the audit to show (null for none). Called after every change.
  send: (playerId: string, snapshot: AuditSnapshot | null) => void;
  // A random number from 0 up to 1. Tests pass a predictable one.
  random?: () => number;
}

interface PlayerAudit {
  objective: AuditObjective;
  callId: number;
  facts: AuditFacts;
  status: AuditStatus;
  // True once the call has ended and the result counted.
  graded: boolean;
  // A Sandbox audit: graded, but nothing paid out or raised.
  sandbox: boolean;
}

export class AuditService {
  private readonly audits = new Map<string, PlayerAudit>();
  private readonly options: AuditServiceOptions;
  private readonly random: () => number;

  constructor(options: AuditServiceOptions) {
    this.options = options;
    this.random = options.random ?? Math.random;
  }

  /** The audit to show the player, or null. */
  snapshot(playerId: string): AuditSnapshot | null {
    const audit = this.audits.get(playerId);
    return audit ? makeSnapshot(audit) : null;
  }

  /** A call was answered: the last call's audit result goes away. */
  callStarted(playerId: string): void {
    if (this.audits.delete(playerId)) {
      this.options.send(playerId, null);
    }
  }

  /** The player said `text` on the call. Counts it toward the audit, then maybe starts one. */
  playerSaid(playerId: string, text: string): void {
    const call = this.options.callProgress(playerId);
    if (!call) {
      return;
    }
    const audit = this.current(playerId, call);
    if (audit) {
      audit.facts.playerTurns = call.playerTurns;
      audit.facts.awaitingReply = true;
      audit.facts.phraseCount += countPhrase(text, ServerConfig.Audit.Phrase);
      if (saysWord(text, ServerConfig.Audit.ForbiddenWord)) {
        audit.facts.saidForbiddenWord = true;
      }
      this.checkLost(audit);
      this.publish(playerId, audit);
      return;
    }
    // Once per call: this message is the one that might bring an audit.
    if (
      call.playerTurns === ServerConfig.Audit.AfterPlayerTurn &&
      this.random() < ServerConfig.Audit.Chance
    ) {
      // The victim hasn't answered this message yet.
      this.start(playerId, call, null, { force: false, awaitingReply: true });
    }
  }

  /** The victim said a line: the code, the card or the trust may have changed. */
  victimSpoke(playerId: string): void {
    const call = this.options.callProgress(playerId);
    const audit = call && this.current(playerId, call);
    if (!call || !audit) {
      return;
    }
    this.notice(audit, call);
    this.checkLost(audit);
    this.publish(playerId, audit);
  }

  /** Starts an audit on the player's call now (the "!audit" test word): objective `id`, or
   * any that fits. Not on a call that already has one. Returns whether it started. */
  force(playerId: string, id: AuditObjectiveId | null): boolean {
    const call = this.options.callProgress(playerId);
    if (!call || this.audits.get(playerId)?.callId === call.callId) {
      return false;
    }
    // Typed on the player's turn, so no reply is pending.
    return this.start(playerId, call, id, { force: true, awaitingReply: false });
  }

  /** The call ended with `reason`: grades its audit, unless the shift is already over. */
  callEnded(playerId: string, reason: CallEndReason): void {
    const audit = this.audits.get(playerId);
    if (!audit || audit.graded) {
      return;
    }
    if (!audit.sandbox && (reason === "shiftEnded" || !this.options.shift.isOnShift(playerId))) {
      this.clear(playerId);
      return;
    }
    const passed = auditPassed(audit.objective, audit.facts, reason);
    audit.status = passed ? "passed" : "failed";
    audit.graded = true;
    this.publish(playerId, audit);
    if (audit.sandbox) {
      this.options.mail(playerId, {
        template: passed ? "auditPassed" : "auditFailed",
        vars: { objective: audit.objective.id, sandbox: 1 },
      });
    } else {
      this.payOut(playerId, audit.objective.id, passed);
    }
  }

  /** A pass adds a bonus to the shift and XP; a fail raises the quota. Skibidi emails it. */
  private payOut(playerId: string, objective: AuditObjectiveId, passed: boolean): void {
    const { PassMoney, PassXP, FailQuotaRaise } = ServerConfig.Audit;
    if (passed) {
      this.options.shift.auditPassed(playerId, PassMoney, PassXP);
      this.options.mail(playerId, {
        template: "auditPassed",
        vars: { objective, money: PassMoney, xp: PassXP },
      });
      return;
    }
    const quota = this.options.shift.auditFailed(playerId, FailQuotaRaise);
    if (quota !== null) {
      this.options.mail(playerId, {
        template: "auditFailed",
        vars: { objective, raise: FailQuotaRaise, quota },
      });
    }
  }

  /** Forgets the player's audit and takes it off their screen, e.g. when they leave a save. */
  clear(playerId: string): void {
    if (this.audits.delete(playerId)) {
      this.options.send(playerId, null);
    }
  }

  removePlayer(playerId: string): void {
    this.audits.delete(playerId);
  }

  removeAll(): void {
    this.audits.clear();
  }

  /** The player's audit if it belongs to this call and hasn't been graded. */
  private current(playerId: string, call: CallProgress): PlayerAudit | null {
    const audit = this.audits.get(playerId);
    return audit && !audit.graded && audit.callId === call.callId ? audit : null;
  }

  private start(
    playerId: string,
    call: CallProgress,
    id: AuditObjectiveId | null,
    { force, awaitingReply }: { force: boolean; awaitingReply: boolean },
  ): boolean {
    const mode = this.options.modeOf(playerId);
    const sandbox = mode === "sandbox";
    if (mode === null || (sandbox && !force)) {
      return false;
    }
    const objective = id === null ? this.pick(call) : AuditObjectives[id];
    if (!objective || !objective.fits(call)) {
      return false;
    }
    // Sandbox has no shift to count it against.
    if (!sandbox && !this.options.shift.claimAudit(playerId, force)) {
      return false;
    }
    const audit: PlayerAudit = {
      objective,
      callId: call.callId,
      facts: {
        startTurn: call.playerTurns,
        playerTurns: call.playerTurns,
        awaitingReply,
        phraseCount: 0,
        saidForbiddenWord: false,
        codeTurn: null,
        codeWasBait: false,
        cardRevealed: false,
        wentRed: false,
      },
      status: "active",
      graded: false,
      sandbox,
    };
    this.audits.set(playerId, audit);
    const { PassMoney, PassXP, FailQuotaRaise } = ServerConfig.Audit;
    this.options.mail(playerId, {
      template: "auditAssigned",
      vars: sandbox
        ? { objective: objective.id, sandbox: 1 }
        : { objective: objective.id, money: PassMoney, xp: PassXP, raise: FailQuotaRaise },
    });
    this.publish(playerId, audit);
    return true;
  }

  /** A random objective that fits the call, or null if none does. */
  private pick(call: CallProgress): AuditObjective | null {
    const fitting = AuditObjectiveIds.map((id) => AuditObjectives[id]).filter((objective) =>
      objective.fits(call),
    );
    return fitting[Math.floor(this.random() * fitting.length)] ?? null;
  }

  private notice(audit: PlayerAudit, call: CallProgress): void {
    const { facts } = audit;
    facts.playerTurns = call.playerTurns;
    facts.awaitingReply = false;
    if (call.codeRevealed && facts.codeTurn === null) {
      facts.codeTurn = call.playerTurns;
      facts.codeWasBait = call.bait;
    }
    facts.cardRevealed ||= call.cardRevealed;
    facts.wentRed ||= call.trust === "angry";
  }

  /** Shows a sure fail straight away. It's still only graded (and paid) when the call ends. */
  private checkLost(audit: PlayerAudit): void {
    if (audit.status === "active" && audit.objective.lost(audit.facts)) {
      audit.status = "failed";
    }
  }

  private publish(playerId: string, audit: PlayerAudit): void {
    this.options.send(playerId, makeSnapshot(audit));
  }
}

function makeSnapshot(audit: PlayerAudit): AuditSnapshot {
  return {
    task: audit.objective.task,
    progress: audit.objective.progress(audit.facts),
    status: audit.status,
  };
}
