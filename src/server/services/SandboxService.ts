// Sandbox mode (docs/design.md "Game modes"): no shifts, quota or XP. Calls never ring by
// themselves: the control panel's Ring now does it. The panel also picks who calls, whether they
// have a side problem, and where replies come from, and can make the victim read their card
// or hang up. Everything here only works while the player is playing their Sandbox save;
// a Campaign player's requests are ignored. The settings live in the Sandbox save's stats,
// so they never touch a Campaign slot.

import { Config } from "@shared/Config";
import {
  type SandboxCheat,
  type SandboxSettings,
  type SandboxSettingsChange,
  type SandboxSnapshot,
} from "@shared/sandbox";
import { ThemeIds, WallpaperIds } from "@shared/cosmetics";
import type { ScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import type { Scenario } from "@server/scenarios/scenarioSchema";
import type { CallOverrides } from "@server/services/CallService";
import { defaultStats, type StatsService } from "@server/services/StatsService";

/** What SandboxService needs from CallService. */
export interface SandboxCalls {
  startCalls: (playerId: string) => void;
  stopCalls: (playerId: string) => void;
  ringNow: (playerId: string) => void;
  setSuspicion: (playerId: string, suspicion: number) => void;
  cheat: (playerId: string, cheat: Exclude<SandboxCheat, "audit">) => void;
  forceHangUp: (playerId: string, reason: "playerHungUp") => boolean;
  // The scenario on the line (or ringing), for turning the trust slider into suspicion.
  currentScenario: (playerId: string) => Scenario | null;
}

export interface SandboxServiceOptions {
  scenarios: ScenarioRegistry;
  stats: StatsService;
  // True while the player is playing their Sandbox save.
  isSandbox: (playerId: string) => boolean;
  // Whether the server can use the AI at all (shown on the panel).
  aiAvailable: boolean;
  // Has Skibidi audit the call in progress (the panel's Trigger audit button).
  startAudit: (playerId: string) => void;
  send: (playerId: string, snapshot: SandboxSnapshot) => void;
  random?: () => number;
}

// High enough that every scenario counts as unlocked.
const EveryLevel = Number.MAX_SAFE_INTEGER;

export class SandboxService implements CallOverrides {
  private readonly options: SandboxServiceOptions;
  private readonly random: () => number;
  // Set once the CallService exists (it's made with this as its overrides).
  private calls: SandboxCalls | null = null;

  constructor(options: SandboxServiceOptions) {
    this.options = options;
    this.random = options.random ?? Math.random;
  }

  setCalls(calls: SandboxCalls): void {
    this.calls = calls;
  }

  /** The player just started playing their Sandbox save: calls can be rung (Ring now). */
  enter(playerId: string): void {
    if (!this.options.isSandbox(playerId)) {
      return;
    }
    this.calls?.startCalls(playerId);
    this.publish(playerId);
  }

  /** The player is leaving Sandbox: calls stop, and one in progress ends. */
  leave(playerId: string): void {
    this.calls?.stopCalls(playerId);
    this.calls?.forceHangUp(playerId, "playerHungUp");
  }

  /** What the control panel shows, or null outside Sandbox. */
  snapshot(playerId: string): SandboxSnapshot | null {
    if (!this.options.isSandbox(playerId)) {
      return null;
    }
    return {
      settings: this.settings(playerId),
      callers: this.options.scenarios.all.map((scenario) => ({
        id: scenario.id,
        name: scenario.displayName,
      })),
      aiAvailable: this.options.aiAvailable,
    };
  }

  /** Changes control panel settings. A caller that doesn't exist is ignored. */
  update(playerId: string, change: SandboxSettingsChange): void {
    if (!this.options.isSandbox(playerId)) {
      return;
    }
    const { nextCaller } = change;
    if (
      nextCaller !== undefined &&
      nextCaller !== Config.Sandbox.RandomCaller &&
      this.options.scenarios.get(nextCaller) === undefined
    ) {
      return;
    }
    const before = this.settings(playerId);
    const after: SandboxSettings = {
      nextCaller: nextCaller ?? before.nextCaller,
      sideProblem: change.sideProblem ?? before.sideProblem,
      replies: change.replies ?? before.replies,
    };
    this.options.stats.update(playerId, (stats) => {
      stats.sandbox = after;
    });
    this.publish(playerId);
  }

  ringNow(playerId: string): void {
    if (this.options.isSandbox(playerId)) {
      this.calls?.ringNow(playerId);
    }
  }

  /** Sets the trust bar during a call: 100 is fully trusting, 0 is about to hang up. */
  setTrust(playerId: string, percent: number): void {
    const scenario = this.calls?.currentScenario(playerId);
    if (!this.options.isSandbox(playerId) || !scenario) {
      return;
    }
    const max = Config.Sandbox.TrustSliderMax;
    const closeness = 1 - Math.min(Math.max(percent, 0), max) / max;
    this.calls?.setSuspicion(playerId, closeness * scenario.suspicionThreshold);
  }

  cheat(playerId: string, cheat: SandboxCheat): void {
    if (!this.options.isSandbox(playerId)) {
      return;
    }
    if (cheat === "audit") {
      this.options.startAudit(playerId);
    } else {
      this.calls?.cheat(playerId, cheat);
    }
  }

  /** Puts on any wallpaper or theme, bought or not. */
  wear(playerId: string, id: string): void {
    if (!this.options.isSandbox(playerId)) {
      return;
    }
    const wallpaper = WallpaperIds.find((known) => known === id);
    const theme = ThemeIds.find((known) => known === id);
    if (wallpaper === undefined && theme === undefined) {
      return;
    }
    this.options.stats.update(playerId, (stats) => {
      if (wallpaper !== undefined) {
        stats.wallpaper = wallpaper;
      }
      if (theme !== undefined) {
        stats.theme = theme;
      }
    });
  }

  /** Starts the Sandbox save over: no purchases, default look and settings. */
  reset(playerId: string): void {
    if (!this.options.isSandbox(playerId)) {
      return;
    }
    this.options.stats.update(playerId, (stats) => {
      // How to Play describes Campaign shifts, so it doesn't pop up in Sandbox again.
      Object.assign(stats, defaultStats(), { tutorialSeen: true });
    });
    this.publish(playerId);
  }

  // CallOverrides: how Sandbox calls differ.

  pickScenario(playerId: string, lastId: string | null): Scenario | null {
    if (!this.options.isSandbox(playerId)) {
      return null;
    }
    const { nextCaller } = this.settings(playerId);
    return (
      this.options.scenarios.get(nextCaller) ??
      this.options.scenarios.pick(EveryLevel, lastId, this.random)
    );
  }

  sideProblem(playerId: string): boolean | null {
    if (!this.options.isSandbox(playerId)) {
      return null;
    }
    const { sideProblem } = this.settings(playerId);
    return sideProblem === "random" ? null : sideProblem === "always";
  }

  autoRing(playerId: string): boolean {
    return !this.options.isSandbox(playerId);
  }

  useAI(playerId: string): boolean {
    return !this.options.isSandbox(playerId) || this.settings(playerId).replies === "ai";
  }

  private settings(playerId: string): SandboxSettings {
    return this.options.stats.get(playerId).sandbox;
  }

  private publish(playerId: string): void {
    const snapshot = this.snapshot(playerId);
    if (snapshot) {
      this.options.send(playerId, snapshot);
    }
  }
}
