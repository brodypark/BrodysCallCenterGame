// Suspicion rules: how much one reply may change it, and how it shows on the trust bar.
// Plain functions, so they're easy to test.

import { Config } from "@shared/Config";
import type { TrustMeter, TrustWord } from "@shared/types";

const Percent = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** One reply's suspicion change, made safe: a whole number within the per-turn limits.
 * Replies will come from the AI, so a bad number (NaN, infinity) counts as no change. */
export function clampSuspicionChange(change: number): number {
  if (!Number.isFinite(change)) {
    return 0;
  }
  const { MaxDropPerTurn, MaxRisePerTurn } = Config.Suspicion;
  return Math.round(clamp(change, -MaxDropPerTurn, MaxRisePerTurn));
}

/** Suspicion after a reply's change, kept within Config.Suspicion's range. */
export function applySuspicionChange(suspicion: number, change: number): number {
  const { Min, Max } = Config.Suspicion;
  return clamp(suspicion + clampSuspicionChange(change), Min, Max);
}

/** The trust bar for a victim at `suspicion`, who hangs up at `threshold` and reveals the
 * code below `trustLevel`. Trust is measured towards the hang-up point, so the bar is empty
 * exactly when they hang up. */
export function trustMeter(suspicion: number, threshold: number, trustLevel: number): TrustMeter {
  const limit = Math.max(threshold, 1);
  const closeness = clamp(suspicion / limit, 0, 1);
  let word: TrustWord = "unsure";
  if (suspicion < trustLevel) {
    word = "trusting";
  } else if (closeness >= Config.Trust.AngryAt) {
    word = "angry";
  } else if (closeness >= Config.Trust.WaryAt) {
    word = "wary";
  }
  return {
    percent: Math.round((1 - closeness) * Percent),
    word,
    revealAt: Math.round((1 - clamp(trustLevel / limit, 0, 1)) * Percent),
  };
}
