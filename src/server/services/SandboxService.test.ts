import { beforeEach, describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import type { SandboxCheat, SandboxSnapshot } from "@shared/sandbox";
import { AllScenarios } from "@server/scenarios/all";
import { createScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import type { Scenario } from "@server/scenarios/scenarioSchema";
import { SandboxService } from "@server/services/SandboxService";
import { StatsService } from "@server/services/StatsService";

const PlayerId = "player-1";
const scenarios = createScenarioRegistry(AllScenarios);

let inSandbox: boolean;
let sent: SandboxSnapshot[];
let actions: string[];
let onLine: Scenario | null;
let stats: StatsService;
let sandbox: SandboxService;

beforeEach(() => {
  inSandbox = true;
  sent = [];
  actions = [];
  onLine = null;
  stats = new StatsService({ send: () => undefined, save: () => undefined });
  sandbox = new SandboxService({
    scenarios,
    stats,
    isSandbox: () => inSandbox,
    aiAvailable: true,
    send: (_playerId, snapshot) => sent.push(snapshot),
    random: () => 0,
  });
  sandbox.setCalls({
    startCalls: () => actions.push("start"),
    stopCalls: () => actions.push("stop"),
    ringNow: () => actions.push("ring"),
    setSuspicion: (_playerId, suspicion) => actions.push(`suspicion ${suspicion}`),
    cheat: (_playerId, cheat: SandboxCheat) => actions.push(cheat),
    forceHangUp: () => {
      actions.push("hang up");
      return true;
    },
    currentScenario: () => onLine,
  });
});

describe("SandboxService: outside Sandbox", () => {
  it("does nothing for a Campaign player, and leaves their calls alone", () => {
    inSandbox = false;
    sandbox.enter(PlayerId);
    sandbox.update(PlayerId, { nextCaller: "hudson" });
    sandbox.ringNow(PlayerId);
    sandbox.cheat(PlayerId, "readCode");
    sandbox.wear(PlayerId, "darkMode");
    sandbox.reset(PlayerId);
    expect(actions).toEqual([]);
    expect(sent).toEqual([]);
    expect(sandbox.snapshot(PlayerId)).toBeNull();
    expect(stats.get(PlayerId).sandbox.nextCaller).toBe(Config.Sandbox.RandomCaller);
    expect(stats.get(PlayerId).theme).not.toBe("darkMode");
    // Campaign calls play by the normal rules.
    expect(sandbox.pickScenario(PlayerId, null)).toBeNull();
    expect(sandbox.sideProblem(PlayerId)).toBeNull();
    expect(sandbox.useAI(PlayerId)).toBe(true);
  });
});

describe("SandboxService", () => {
  it("starts calls on entering, and lists every caller", () => {
    sandbox.enter(PlayerId);
    expect(actions).toEqual(["start"]);
    expect(sent.at(-1)?.callers.map((caller) => caller.id)).toEqual(
      scenarios.all.map((scenario) => scenario.id),
    );
  });

  it("calls the chosen caller, or anyone (whatever their level) at random", () => {
    expect(sandbox.pickScenario(PlayerId, null)).not.toBeNull();
    sandbox.update(PlayerId, { nextCaller: "cj" });
    expect(sandbox.pickScenario(PlayerId, null)?.id).toBe("cj");
    // The highest-level caller is available from the start in Sandbox.
    expect(stats.get(PlayerId).xp).toBe(0);
  });

  it("ignores a caller that doesn't exist", () => {
    sandbox.update(PlayerId, { nextCaller: "nobody" });
    expect(stats.get(PlayerId).sandbox.nextCaller).toBe(Config.Sandbox.RandomCaller);
  });

  it("sets the side problem and reply source for the next calls", () => {
    sandbox.update(PlayerId, { sideProblem: "always", replies: "scripted" });
    expect(sandbox.sideProblem(PlayerId)).toBe(true);
    expect(sandbox.useAI(PlayerId)).toBe(false);
    sandbox.update(PlayerId, { sideProblem: "never" });
    expect(sandbox.sideProblem(PlayerId)).toBe(false);
    sandbox.update(PlayerId, { sideProblem: "random", replies: "ai" });
    expect(sandbox.sideProblem(PlayerId)).toBeNull();
    expect(sandbox.useAI(PlayerId)).toBe(true);
  });

  it("never rings by itself in Sandbox, only when asked", () => {
    expect(sandbox.autoRing(PlayerId)).toBe(false);
    sandbox.ringNow(PlayerId);
    expect(actions).toEqual(["ring"]);
    inSandbox = false;
    expect(sandbox.autoRing(PlayerId)).toBe(true);
  });

  it("turns the trust slider into suspicion for the caller on the line", () => {
    sandbox.setTrust(PlayerId, 50);
    expect(actions).toEqual([]);
    onLine = scenarios.get("grandma") ?? null;
    sandbox.setTrust(PlayerId, 100);
    sandbox.setTrust(PlayerId, 25);
    expect(actions).toEqual(["suspicion 0", "suspicion 75"]);
  });

  it("passes cheats on, and stops calls when leaving", () => {
    sandbox.cheat(PlayerId, "readCard");
    sandbox.leave(PlayerId);
    expect(actions).toEqual(["readCard", "stop", "hang up"]);
  });

  it("wears any cosmetic, owned or not, but not made-up ones", () => {
    sandbox.wear(PlayerId, "darkMode");
    sandbox.wear(PlayerId, "puddingPink");
    sandbox.wear(PlayerId, "notAThing");
    expect(stats.get(PlayerId)).toMatchObject({ theme: "darkMode", wallpaper: "puddingPink" });
  });

  it("resets purchases, look and settings", () => {
    sandbox.update(PlayerId, { nextCaller: "pete" });
    stats.update(PlayerId, (current) => {
      current.upgrades = { smoothTalker: 2 };
    });
    sandbox.reset(PlayerId);
    expect(stats.get(PlayerId)).toMatchObject({
      upgrades: {},
      sandbox: { nextCaller: Config.Sandbox.RandomCaller },
    });
  });
});
