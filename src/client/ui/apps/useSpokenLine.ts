// The subtitle of the line the victim is saying right now, typed out letter by letter as
// they say it. Checks every frame until the whole line is out, and only re-renders when
// another letter shows. Letters never disappear again, even if the line falls back to
// subtitles only part way through or restarts after a reconnect.

import { useEffect, useState } from "react";
import { type SpokenSplit, splitSpoken } from "@client/voice/spokenWords";
import { victimLineProgress } from "@client/voice/VictimVoice";
import type { VictimLine } from "@client/voice/victimLine";

export interface SpokenLine extends SpokenSplit {
  lineId: number;
  // True once every letter is out (said, or skipped).
  done: boolean;
}

function spokenLine(line: VictimLine, progress: number): SpokenLine {
  return { lineId: line.lineId, ...splitSpoken(line.text, progress), done: progress >= 1 };
}

/** How much of `line` has been said, or null when the victim isn't saying anything. */
export function useSpokenLine(line: VictimLine | null): SpokenLine | null {
  const [spoken, setSpoken] = useState<SpokenLine | null>(null);
  const lineId = line?.lineId ?? null;
  const text = line?.text ?? null;

  useEffect(() => {
    if (lineId === null || text === null) {
      return;
    }
    let frame = 0;
    let furthest = 0;
    const update = (): void => {
      furthest = Math.max(furthest, victimLineProgress(lineId));
      const next = spokenLine({ lineId, text }, furthest);
      setSpoken((previous) =>
        previous?.lineId === lineId &&
        previous.said === next.said &&
        previous.unsaid === next.unsaid &&
        previous.done === next.done
          ? previous
          : next,
      );
      if (!next.done) {
        frame = requestAnimationFrame(update);
      }
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [lineId, text]);

  if (line === null) {
    return null;
  }
  // Until the effect catches up with a new line, nothing of it has been said. Line ids start
  // over when the server forgets a player, so the text is checked too.
  if (spoken?.lineId !== line.lineId || spoken.said + spoken.unsaid !== line.text) {
    return spokenLine(line, 0);
  }
  return spoken;
}
