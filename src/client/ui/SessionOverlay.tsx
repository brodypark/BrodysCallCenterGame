// Covers the desktop when the game has been opened in another tab, which took over. The
// player can take it back here.

import { GameInfo } from "@shared/gameInfo";
import type { ReactElement } from "react";
import { playHere } from "@client/net/session";
import { useConnection } from "@client/state/connectionStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import styles from "@client/ui/SessionOverlay.module.css";

export function SessionOverlay(): ReactElement | null {
  const { status } = useConnection();
  if (status !== "replaced") {
    return null;
  }

  return (
    <div className={styles.shade}>
      <div
        className={cx(controls.raised, styles.dialog)}
        role="alertdialog"
        aria-labelledby="session-overlay-title"
      >
        <p id="session-overlay-title" className={styles.title}>
          Opened in another tab
        </p>
        <p className={styles.text}>
          {GameInfo.Name} is running in another tab, so this one paused.
        </p>
        {/* The rest of the desktop is inert, so focus goes here. */}
        <button type="button" className={controls.button} onClick={playHere} autoFocus>
          Play here
        </button>
      </div>
    </div>
  );
}
