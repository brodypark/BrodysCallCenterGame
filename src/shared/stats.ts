// The player's stats, as a Zod schema. The type comes from the schema, so a save can never
// hold a field the schema doesn't know (which would be dropped on load). New fields get a
// default, so saves made before they existed still load.

import { z } from "zod";

const count = z.number().int().min(0).default(0);

export const PlayerStatsSchema = z.object({
  // Banked money. Doesn't include the current shift's earnings.
  money: count,
  xp: count,
  callsCompleted: count,
  successfulCalls: count,
  shiftsPassed: count,
  shiftsFailed: count,
});

export type PlayerStats = z.output<typeof PlayerStatsSchema>;
