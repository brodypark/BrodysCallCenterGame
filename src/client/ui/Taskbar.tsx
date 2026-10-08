// The bar along the bottom of the desktop: the start button, a button for each open window,
// and a tray with the shift timer, earnings vs. quota, the server connection and a clock.

import type { ReactElement } from "react";
import { formatClock } from "@shared/time";
import { Apps } from "@client/ui/appList";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import { useDesktop, useDesktopState } from "@client/ui/DesktopContext";
import { useNow } from "@client/ui/useNow";
import { type ConnectionStatus, useConnection } from "@client/state/connectionStore";
import { secondsUntil, type ShiftState, useShift } from "@client/state/shiftStore";
import styles from "@client/ui/Taskbar.module.css";

// How often the clock and the shift countdown are redrawn.
const ClockRefreshMs = 1000;
// e.g. "9:05 PM", in the player's own language and time zone.
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function Taskbar(): ReactElement {
  const { store } = useDesktop();
  const { openOrder, stackOrder, startMenuOpen } = useDesktopState();
  const shift = useShift();
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
        <ShiftTimer shift={shift} />
        <span>
          ${shift.snapshot.earnings} / ${shift.snapshot.quota}
        </span>
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
  const now = useNow(ClockRefreshMs);
  return <span>{clockFormat.format(now)}</span>;
}

/** Time left on the shift, OVERTIME (in red) once it runs out, or Off duty. */
function ShiftTimer({ shift }: { shift: ShiftState }): ReactElement {
  // Re-renders every second so the countdown moves.
  useNow(ClockRefreshMs);
  const { status, endsAt, overtimeEndsAt } = shift.snapshot;
  if (status === "overtime") {
    const left =
      overtimeEndsAt === null
        ? ""
        : ` ${formatClock(secondsUntil(overtimeEndsAt, shift.clockOffsetMs))}`;
    return <span className={styles.overtime}>OVERTIME{left}</span>;
  }
  if (status === "onShift" && endsAt !== null) {
    return <span>Shift {formatClock(secondsUntil(endsAt, shift.clockOffsetMs))}</span>;
  }
  return <span>Off duty</span>;
}
