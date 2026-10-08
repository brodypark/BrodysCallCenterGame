// Checks every scenario when the server starts and answers questions about them: which one
// has an id, which are unlocked at a level, and which should call next. A broken scenario
// stops the server with a clear message instead of failing in the middle of a call.

import { z } from "zod";
import {
  type Scenario,
  type ScenarioInput,
  ScenarioSchema,
} from "@server/scenarios/scenarioSchema";

export interface ScenarioRegistry {
  /** Every scenario, by unlock level and then id. */
  readonly all: readonly Scenario[];
  get: (id: string) => Scenario | undefined;
  /** Every scenario unlocked at `level`, in a fixed order. Never empty for level 1 or more. */
  unlockedFor: (level: number) => Scenario[];
  /** The scenarios that unlock when a player goes from `fromLevel` up to `toLevel`. */
  unlockedBetween: (fromLevel: number, toLevel: number) => Scenario[];
  /**
   * A random scenario unlocked at `level`. When more than one is unlocked, never `lastId`
   * again, so the same victim doesn't call twice in a row.
   */
  pick: (level: number, lastId: string | null, random: () => number) => Scenario;
}

/** Validates the scenarios and builds the registry. Throws if any of them is broken. */
export function createScenarioRegistry(inputs: readonly ScenarioInput[]): ScenarioRegistry {
  const ids = new Set<string>();
  const prefixes = new Set<string>();
  const all: Scenario[] = [];

  inputs.forEach((input, index) => {
    const result = ScenarioSchema.safeParse(input);
    if (!result.success) {
      throw new Error(
        `Scenario ${index} (${input.id}) is broken:\n${z.prettifyError(result.error)}`,
      );
    }
    const scenario = result.data;
    if (ids.has(scenario.id)) {
      throw new Error(`Two scenarios have the id "${scenario.id}".`);
    }
    // Two scenarios sharing a prefix could hand out the same code for different card values.
    if (prefixes.has(scenario.codePrefix)) {
      throw new Error(`Two scenarios have the code prefix "${scenario.codePrefix}".`);
    }
    ids.add(scenario.id);
    prefixes.add(scenario.codePrefix);
    all.push(scenario);
  });

  all.sort((a, b) => a.unlockLevel - b.unlockLevel || a.id.localeCompare(b.id));
  // New players need someone to call them.
  if (all[0]?.unlockLevel !== 1) {
    throw new Error("No scenario has unlockLevel 1, so new players would never get a call.");
  }

  function unlockedFor(level: number): Scenario[] {
    return all.filter((scenario) => scenario.unlockLevel <= level);
  }

  return {
    all,
    get: (id) => all.find((scenario) => scenario.id === id),
    unlockedFor,
    unlockedBetween: (fromLevel, toLevel) =>
      all.filter((scenario) => scenario.unlockLevel > fromLevel && scenario.unlockLevel <= toLevel),
    pick: (level, lastId, random) => {
      const unlocked = unlockedFor(Math.max(level, 1));
      const others = unlocked.filter((scenario) => scenario.id !== lastId);
      const choices = others.length > 0 ? others : unlocked;
      const choice = choices[Math.floor(random() * choices.length)] ?? choices[0];
      if (!choice) {
        throw new Error("No scenario is unlocked at level 1.");
      }
      return choice;
    },
  };
}
