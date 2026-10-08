// Spots big trust swings during a call (Config.Effects.BigTrustChangePercent in one go):
// the Call window flashes the trust bar, beeps, and the face looks happy or angry for a
// moment before going back to its resting mood.

import { useEffect, useState } from "react";
import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import type { TrustMeter } from "@shared/types";
import type { Mood } from "@client/ui/faceParts";
import { playSound } from "@client/ui/sounds";

export interface TrustSwing {
  // Goes up by one per swing, so each one restarts the flash.
  id: number;
  // True if the victim got more suspicious (trust fell).
  suspicionRose: boolean;
}

export interface TrustReaction {
  // The latest big swing this call, for the bar's flash.
  swing: TrustSwing | null;
  // The face's reaction to it while it lasts, else null (the resting mood shows).
  mood: Mood | null;
}

export function useTrustReaction(trust: TrustMeter | null): TrustReaction {
  const percent = trust?.percent ?? null;
  const [seenPercent, setSeenPercent] = useState(percent);
  const [swing, setSwing] = useState<TrustSwing | null>(null);
  // The swing whose reaction has worn off.
  const [overId, setOverId] = useState<number | null>(null);

  // Compared while rendering, so the reaction shows in the same frame as the new trust.
  if (percent !== seenPercent) {
    setSeenPercent(percent);
    if (percent === null) {
      // Between calls: the next one starts fresh.
      setSwing(null);
      setOverId(null);
    } else if (
      seenPercent !== null &&
      Math.abs(percent - seenPercent) >= Config.Effects.BigTrustChangePercent
    ) {
      setSwing({ id: (swing?.id ?? 0) + 1, suspicionRose: percent < seenPercent });
    }
  }

  useEffect(() => {
    if (swing === null) {
      return;
    }
    playSound(swing.suspicionRose ? "suspicion-up" : "suspicion-down");
    const timer = setTimeout(
      () => setOverId(swing.id),
      secondsToMs(Config.Effects.ReactionSeconds),
    );
    return () => clearTimeout(timer);
  }, [swing]);

  const reacting = swing !== null && swing.id !== overId;
  return {
    swing,
    mood: reacting ? (swing.suspicionRose ? "angry" : "happy") : null,
  };
}
