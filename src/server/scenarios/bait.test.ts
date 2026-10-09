import { describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import { ServerConfig } from "@server/config";
import { AllScenarios } from "@server/scenarios/all";
import { BaitFallbackReplies, toBaitScenario } from "@server/scenarios/bait";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import { ScenarioSchema } from "@server/scenarios/scenarioSchema";
import { applySuspicionChange } from "@server/services/suspicion";

const registry = createScenarioRegistry(AllScenarios);

describe("toBaitScenario", () => {
  it.each(registry.all.map((scenario) => [scenario.id, scenario] as const))(
    "makes %s a valid bait caller with the trap prefix",
    (_id, scenario) => {
      const bait = toBaitScenario(scenario);
      // Valid apart from the trap prefix, which only bait callers may use.
      expect(ScenarioSchema.safeParse({ ...bait, codePrefix: scenario.codePrefix }).success).toBe(
        true,
      );
      expect(ScenarioSchema.safeParse(bait).success).toBe(false);
      expect(bait.codePrefix).toBe(ServerConfig.Bait.CodePrefix);
      expect(bait.persona).toEqual(scenario.persona);
      // The trust bar starts where the real caller's does, so it can't give them away.
      expect(bait.startingSuspicion).toBe(scenario.startingSuspicion);
      // Their Wobblebucks Card would pay out for real.
      expect(bait.sideProblem).toBeUndefined();
    },
  );

  it.each(registry.all.map((scenario) => [scenario.id, scenario] as const))(
    "has %s read the trap code from the scripted replies without hanging up",
    (_id, scenario) => {
      const bait = toBaitScenario(scenario);
      let suspicion = bait.startingSuspicion;
      let revealedOn: number | null = null;
      BaitFallbackReplies.forEach((reply, index) => {
        suspicion = applySuspicionChange(suspicion, reply.suspicionChange);
        expect(suspicion).toBeLessThan(bait.suspicionThreshold);
        const turn = index + 1;
        if (
          revealedOn === null &&
          reply.revealsCode &&
          suspicion < bait.trustLevel &&
          turn >= Config.Call.MinTurnsBeforeReveal
        ) {
          revealedOn = turn;
        }
      });
      expect(revealedOn).not.toBeNull();
    },
  );

  it("keeps every scripted line short enough to say", () => {
    for (const reply of BaitFallbackReplies) {
      expect(reply.reply.length).toBeLessThanOrEqual(Config.AI.MaxReplyLength);
    }
  });
});
