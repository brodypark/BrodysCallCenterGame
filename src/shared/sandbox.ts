// Game modes, and Sandbox's control panel settings. Campaign is the game with shifts, the
// quota, XP and unlocks; Sandbox has no shifts, unlimited money, and a control panel to pick
// who calls and bend the rules. The server owns the mode: the client only asks.

import { z } from "zod";
import { Config } from "@shared/Config";

export type GameMode = "campaign" | "sandbox";

/** Who rings next in Sandbox: a scenario id, or Config.Sandbox.RandomCaller for any. */
const callerChoice = z.string().min(1).max(Config.Sandbox.MaxCallerIdLength);

export const SideProblemChoices = ["random", "always", "never"] as const;
export type SideProblemChoice = (typeof SideProblemChoices)[number];

export const ReplySources = ["ai", "scripted"] as const;
export type ReplySource = (typeof ReplySources)[number];

/** The control panel's settings, kept in the Sandbox save. */
export const SandboxSettingsSchema = z.object({
  nextCaller: callerChoice.catch(Config.Sandbox.RandomCaller).default(Config.Sandbox.RandomCaller),
  // Whether the next callers have a side problem: rolled as normal, always, or never.
  sideProblem: z.enum(SideProblemChoices).catch("random").default("random"),
  // Where victims' replies come from. The AI's cost limits apply either way.
  replies: z.enum(ReplySources).catch("ai").default("ai"),
  // Whether the next callers are bait (undercover scam-busters). Never rolled in Sandbox.
  bait: z.boolean().catch(false).default(false),
});

export type SandboxSettings = z.output<typeof SandboxSettingsSchema>;

/** A change the control panel asks for: any of the settings. */
export const SandboxSettingsChangeSchema = z.strictObject({
  nextCaller: callerChoice.optional(),
  sideProblem: z.enum(SideProblemChoices).optional(),
  replies: z.enum(ReplySources).optional(),
  bait: z.boolean().optional(),
});

export type SandboxSettingsChange = z.output<typeof SandboxSettingsChangeSchema>;

/** What the control panel can make the victim do during a call, on the player's turn. */
export const SandboxCheats = ["readCode", "readCard", "hangUp", "audit"] as const;
export type SandboxCheat = (typeof SandboxCheats)[number];

/** Everything the control panel shows. Sent in Sandbox whenever it changes. */
export interface SandboxSnapshot {
  settings: SandboxSettings;
  // Every caller the panel can pick: just who they are, nothing hidden.
  callers: { id: string; name: string }[];
  // False when the server has no AI to use (no key, or the scripted-replies switch is on), so
  // replies are scripted whatever the panel says.
  aiAvailable: boolean;
}
