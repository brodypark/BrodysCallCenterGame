// The Characters app's pages: one per caller, in unlock order, like a dossier. A caller the
// player hasn't reached shows only their name and the level they unlock at. Once unlocked,
// their page shows their face, bio and card value, plus hints that unlock as the player
// scams them (Config.Characters). Hint text and spending limits stay on the server until
// they're earned. Sandbox shows every page in full.

import { Config } from "@shared/Config";
import { levelOf } from "@shared/Levels";
import type { CallerRecord, PlayerStats } from "@shared/stats";
import type { CallerHint, CallerHintKind, CallerPage, CharactersSnapshot } from "@shared/types";
import type { ScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import type { Scenario } from "@server/scenarios/scenarioSchema";
import type { StatsService } from "@server/services/StatsService";

const NothingYet: CallerRecord = { scams: 0, charges: 0 };

function hint(kind: CallerHintKind, text: string, remaining: number): CallerHint {
  return { kind, text: remaining === 0 ? text : null, remaining };
}

/** What the player has done to `scenarioId`'s caller so far. */
export function callerRecord(stats: PlayerStats, scenarioId: string): CallerRecord {
  return stats.callers[scenarioId] ?? NothingYet;
}

/** The hints on a caller's page, given what the player has done to them. `revealAll` shows
 * every one (Sandbox). */
export function callerHints(
  scenario: Scenario,
  record: CallerRecord,
  revealAll: boolean,
): CallerHint[] {
  const { ScamsForHint, ChargesForLimit } = Config.Characters;
  const left = (done: number, needed: number): number =>
    revealAll ? 0 : Math.max(0, needed - done);
  const { dossier, sideProblem } = scenario;
  const hints = [
    hint("likes", dossier.likes, left(record.scams, ScamsForHint.likes)),
    hint("dislikes", dossier.dislikes, left(record.scams, ScamsForHint.dislikes)),
    hint("obsession", dossier.obsession, left(record.scams, ScamsForHint.obsession)),
  ];
  if (sideProblem) {
    hints.push(
      hint(
        "spendingLimit",
        `Their Wobblebucks Card takes charges up to $${sideProblem.spendingLimit}. ` +
          "A dollar more and it says no.",
        left(record.charges, ChargesForLimit),
      ),
    );
  }
  return hints;
}

/** Every caller's page for a player with `stats`. */
export function characterPages(
  scenarios: readonly Scenario[],
  stats: PlayerStats,
  revealAll: boolean,
): CallerPage[] {
  const level = levelOf(stats.xp);
  return scenarios.map((scenario): CallerPage => {
    const base = { id: scenario.id, name: scenario.displayName, unlockLevel: scenario.unlockLevel };
    if (!revealAll && scenario.unlockLevel > level) {
      return { unlocked: false, ...base };
    }
    const record = callerRecord(stats, scenario.id);
    return {
      unlocked: true,
      ...base,
      difficulty: scenario.difficulty,
      face: scenario.face,
      bio: scenario.dossier.bio,
      cardValue: scenario.cardValue,
      scams: record.scams,
      hints: callerHints(scenario, record, revealAll),
    };
  });
}

export interface CharacterServiceOptions {
  scenarios: ScenarioRegistry;
  stats: StatsService;
  // True when every page should show in full (Sandbox).
  revealAll: (playerId: string) => boolean;
  send: (playerId: string, snapshot: CharactersSnapshot) => void;
  // The player earned a new hint on `scenarioId`'s page.
  onLearned?: (playerId: string, scenarioId: string) => void;
}

/** How many hints on the page are earned. */
function earnedHints(scenario: Scenario, record: CallerRecord): number {
  return callerHints(scenario, record, false).filter((each) => each.text !== null).length;
}

export class CharacterService {
  private readonly options: CharacterServiceOptions;

  constructor(options: CharacterServiceOptions) {
    this.options = options;
  }

  snapshot(playerId: string): CharactersSnapshot {
    const { scenarios, stats, revealAll } = this.options;
    return { pages: characterPages(scenarios.all, stats.get(playerId), revealAll(playerId)) };
  }

  /** Sends the player their pages. Call it whenever their stats change (a level can unlock a
   * caller, a scam can unlock a hint). */
  publish(playerId: string): void {
    this.options.send(playerId, this.snapshot(playerId));
  }

  /** One of `scenarioId`'s gift cards was cashed in. */
  scammed(playerId: string, scenarioId: string): void {
    this.record(playerId, scenarioId, "scams");
  }

  /** One of `scenarioId`'s Wobblebucks Cards was charged. */
  charged(playerId: string, scenarioId: string): void {
    this.record(playerId, scenarioId, "charges");
  }

  private record(playerId: string, scenarioId: string, field: keyof CallerRecord): void {
    const scenario = this.options.scenarios.get(scenarioId);
    if (!scenario) {
      return;
    }
    let before = NothingYet;
    let after = NothingYet;
    this.options.stats.update(playerId, (stats) => {
      before = callerRecord(stats, scenarioId);
      after = { ...before, [field]: before[field] + 1 };
      stats.callers[scenarioId] = after;
    });
    if (earnedHints(scenario, after) > earnedHints(scenario, before)) {
      this.options.onLearned?.(playerId, scenarioId);
    }
  }
}
