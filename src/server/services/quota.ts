// The shift quota for a level (docs/design.md "Economy"). Later levels unlock callers with
// bigger cards, so the quota grows with the average card value of the callers unlocked at the
// player's level, compared with level 1's. Only Config.Shift.QuotaScaling of that growth is
// passed on, since the bigger cards come from harder callers who hang up more often. Once every
// caller is unlocked the quota stops growing.

import { Config } from "@shared/Config";

/** Average card value of the callers unlocked at a level. */
export type AverageCardValue = (level: number) => number;

/** The quota a shift starts with at `level`, before any audit raises. Never below
 * Config.Shift.Quota. */
export function quotaForLevel(level: number, averageCardValue: AverageCardValue): number {
  const base = averageCardValue(1);
  const current = averageCardValue(Math.max(1, level));
  if (!(base > 0) || !Number.isFinite(current)) {
    return Config.Shift.Quota;
  }
  const growth = Math.max(0, current / base - 1);
  const raw = Config.Shift.Quota * (1 + Config.Shift.QuotaScaling * growth);
  const step = Math.max(1, Config.Shift.QuotaRoundTo);
  return Math.max(Config.Shift.Quota, Math.round(raw / step) * step);
}

/** Averages the card values of `values`; 0 when there are none. */
export function averageOf(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
