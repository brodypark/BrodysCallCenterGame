// The time card in the middle of the desktop between shifts. Clocking in starts a shift; the
// click also unlocks browser audio for the victims' voices.

import type { ReactElement } from "react";
import { formatClock } from "@shared/time";
import { clockIn } from "@client/net/shiftActions";
import { useConnection } from "@client/state/connectionStore";
import { useShift } from "@client/state/shiftStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import { DesktopLayout, percent } from "@client/ui/layout";
import { unlockAudio } from "@client/voice/audioUnlock";
import styles from "@client/ui/ClockIn.module.css";

const Area = DesktopLayout.ClockInArea;

export function ClockIn(): ReactElement | null {
  const { snapshot, result } = useShift();
  const online = useConnection().status === "connected";
  // Hidden on shift, and while the last shift's results are up.
  if (snapshot.status !== "offShift" || result) {
    return null;
  }

  return (
    <section
      className={cx(controls.raised, styles.card)}
      style={{
        left: percent(Area.x),
        top: percent(Area.y),
        width: percent(Area.width),
        height: percent(Area.height),
      }}
      aria-label="Time card"
    >
      <p className={styles.title}>TIME CARD</p>
      <p className={styles.terms}>
        Earn <b>${snapshot.quota}</b> in <b>{formatClock(snapshot.lengthSeconds)}</b> to get
        PROMOTED.
      </p>
      <button
        type="button"
        className={cx(controls.button, styles.clockIn)}
        disabled={!online}
        onClick={() => {
          unlockAudio();
          clockIn();
        }}
      >
        Clock In
      </button>
    </section>
  );
}
