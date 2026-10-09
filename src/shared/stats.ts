// The player's stats, as a Zod schema. The type comes from the schema, so a save can never
// hold a field the schema doesn't know (which would be dropped on load). New fields get a
// default, so saves made before they existed still load.

import { z } from "zod";
import {
  DefaultPet,
  DefaultRingtone,
  DefaultTheme,
  DefaultWallpaper,
  PetIds,
  RingtoneIds,
  ThemeIds,
  WallpaperIds,
} from "@shared/cosmetics";
import { SandboxSettingsSchema } from "@shared/sandbox";

const count = z.number().int().min(0).default(0);

// What the player has done to one caller, which unlocks hints on their Characters page.
const CallerRecordSchema = z.object({
  // Their gift cards cashed in.
  scams: count,
  // Their Wobblebucks Cards charged.
  charges: count,
});

// One email in the player's inbox. Only which email it is and what fills it in are saved;
// the server writes it out (server/mail), so story emails the player hasn't reached never
// reach the client.
const MailEntrySchema = z.object({
  id: z.number().int().min(0),
  template: z.string(),
  vars: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  // When it arrived (milliseconds since 1970).
  sentAt: z.number(),
  read: z.boolean().default(false),
});

const MailboxSchema = z.object({
  // Oldest first.
  inbox: z.array(MailEntrySchema).default([]),
  // The id the next email gets.
  nextId: count,
  // True once the boss's welcome has been sent.
  welcomed: z.boolean().default(false),
  // Shifts failed in a row, for the boss's escalating emails.
  failStreak: count,
  // Callers whose pages gained a hint this shift, by scenario id, for the Research
  // Department's update when it ends.
  pendingIntel: z.array(z.string()).default([]),
});

export const PlayerStatsSchema = z.object({
  // Banked money. Doesn't include the current shift's earnings.
  money: count,
  // Total XP. The level is worked out from it (Levels.ts), not stored.
  xp: count,
  callsCompleted: count,
  successfulCalls: count,
  shiftsPassed: count,
  shiftsFailed: count,
  // Upgrades bought, by id (Upgrades.ts): a perk's tier, or 1 for a cosmetic. Missing means
  // not bought; the default wallpaper, theme, ringtone and pet are owned without being
  // listed.
  upgrades: z.record(z.string(), z.number().int().min(0)).default({}),
  // The wallpaper, window theme, ringtone and desktop pet in use. An unknown id (e.g. one that was
  // removed) falls back to the default instead of breaking the save.
  wallpaper: z.enum(WallpaperIds).catch(DefaultWallpaper).default(DefaultWallpaper),
  theme: z.enum(ThemeIds).catch(DefaultTheme).default(DefaultTheme),
  ringtone: z.enum(RingtoneIds).catch(DefaultRingtone).default(DefaultRingtone),
  pet: z.enum(PetIds).catch(DefaultPet).default(DefaultPet),
  // Per caller, by scenario id. Missing means nothing done to them yet. If it can't be read,
  // it starts over rather than breaking the save.
  callers: z.record(z.string(), CallerRecordSchema).catch({}),
  // The Email app's inbox, and what the emails need to know. Campaign only. If it can't be
  // read, it starts over rather than breaking the save.
  mail: MailboxSchema.catch(() => MailboxSchema.parse({})),
  // True once the player has closed How to Play, so it only opens by itself the first time.
  tutorialSeen: z.boolean().default(false),
  // The Sandbox control panel's settings. Only used in the Sandbox save.
  sandbox: SandboxSettingsSchema.prefault({}),
});

export type PlayerStats = z.output<typeof PlayerStatsSchema>;
export type CallerRecord = z.output<typeof CallerRecordSchema>;
export type MailEntry = z.output<typeof MailEntrySchema>;
