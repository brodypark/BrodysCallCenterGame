// The bar along the bottom of the desktop: the start button, a button for each open window,
// and a tray with the shift timer, earnings vs. quota, the server connection and a clock.
// The shift timer and quota are placeholders until shifts arrive (step 5).

import { type ReactElement, useEffect, useState } from "react";
import { Apps } from "@client/ui/appList";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import { useDesktop, useDesktopState } from "@client/ui/DesktopContext";
import { type ConnectionStatus, useConnection } from "@client/state/connectionStore";
import { useShift } from "@client/state/shiftStore";
import styles from "@client/ui/Taskbar.module.css";

// How often the clock is redrawn.
const ClockRefreshMs = 1000;
// e.g. "9:05 PM", in the player's own language and time zone.
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function Taskbar(): ReactElement {
  const { store } = useDesktop();
  const { openOrder, stackOrder, startMenuOpen } = useDesktopState();
  const { earnings } = useShift();
  const focused = stackOrder.at(-1);

  return (
    // Clicking any empty part of the taskbar closes the start menu.
    <div
      className={cx(controls.raised, styles.taskbar)}
      onClick={() => store.setStartMenuOpen(false)}
    >
      <button
        type="button"
        className={cx(controls.button, styles.start, startMenuOpen && controls.pressed)}
        aria-expanded={startMenuOpen}
        onClick={(event) => {
          event.stopPropagation();
          store.toggleStartMenu();
        }}
      >
        Start
      </button>

      <div className={styles.windowButtons}>
        {openOrder.map((id) => {
          const app = Apps[id];
          const isFocused = id === focused;
          return (
            <button
              key={id}
              type="button"
              className={cx(
                controls.button,
                styles.windowButton,
                isFocused && controls.pressed,
                isFocused && styles.focusedButton,
              )}
              onClick={() => store.focusApp(id)}
            >
              {app.icon} {app.title}
            </button>
          );
        })}
      </div>

      <div className={cx(controls.sunken, styles.tray)}>
        <span>Off duty</span>
        <span>${earnings} / $—</span>
        <ConnectionDot />
        <TrayClock />
      </div>
    </div>
  );
}

const ConnectionLabels: Record<ConnectionStatus, string> = {
  connecting: "Connecting to the server",
  connected: "Connected to the server",
  disconnected: "Not connected to the server",
  replaced: "Open in another tab",
};

function ConnectionDot(): ReactElement {
  const { status } = useConnection();
  const label = ConnectionLabels[status];
  return (
    <span className={cx(styles.dot, styles[status])} role="img" title={label} aria-label={label} />
  );
}

function TrayClock(): ReactElement {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), ClockRefreshMs);
    return () => clearInterval(timer);
  }, []);

  return <span>{clockFormat.format(now)}</span>;
}
