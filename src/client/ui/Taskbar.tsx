// The bar along the bottom of the desktop: the start button, a button for each open window,
// and a tray with the shift timer, earnings vs. quota (rolling up on a payout), the server
// connection and a clock. Once the quota is met, a Clock Out button ends the shift early. In
// Sandbox (no shifts, unlimited money) the timer and earnings
// become SANDBOX and $∞.

import type { ReactElement } from "react";
import { formatClock } from "@shared/time";
import { AppBadge } from "@client/ui/AppBadge";
import { Apps } from "@client/ui/appList";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import { useDesktop, useDesktopState } from "@client/ui/DesktopContext";
import { RollingNumber } from "@client/ui/Effects";
import { useNow } from "@client/ui/useNow";
import { leaveSave } from "@client/net/saveActions";
import { clockOut } from "@client/net/shiftActions";
import { type ConnectionStatus, useConnection } from "@client/state/connectionStore";
import { useGameMode } from "@client/state/savesStore";
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
  const sandbox = useGameMode() === "sandbox";
  const focused = stackOrder.at(-1);
  const { status, earnings, quota } = shift.snapshot;
  const canClockOut = !sandbox && status === "onShift" && earnings >= quota;

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
        title="Start"
      >
        ⏻
      </button>
      <button
        type="button"
        className={cx(controls.button, styles.mainMenu)}
        onClick={(event) => {
          event.stopPropagation();
          leaveSave();
        }}
        title="Quit to Title"
      >
        Quit
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
              style={{ backgroundColor: app.tileColor }}
              title={app.title}
              onClick={() => store.focusApp(id)}
            >
              <span aria-hidden>{app.icon}</span>
              <AppBadge id={id} />
            </button>
          );
        })}
      </div>

      {canClockOut && (
        <button
          type="button"
          className={cx(controls.button, styles.clockOut)}
          onClick={(event) => {
            event.stopPropagation();
            clockOut();
          }}
          title="Quota met: end the shift now"
        >
          Clock Out
        </button>
      )}

      <div className={cx(controls.sunken, styles.tray)}>
        {sandbox ? (
          <div className={styles.statsColumn}>
            <span className={styles.sandbox}>SANDBOX</span>
            <span>$∞</span>
          </div>
        ) : (
          <div className={styles.statsColumn}>
            <div className={styles.statLine1}>
              PERSONAL <RollingNumber value={shift.snapshot.earnings} format={(value) => `$${value}`} />
            </div>
            <div className={styles.statLine2}>
              <span className={styles.quotaStat}>QUOTA {shift.snapshot.earnings}/{shift.snapshot.quota}</span>
            </div>
            <div className={styles.statLine3}>
              <ShiftTimer shift={shift} />
            </div>
          </div>
        )}
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

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

function TrayClock(): ReactElement {
  const now = useNow(ClockRefreshMs);
  return (
    <div className={styles.clockColumn}>
      <div>{clockFormat.format(now)}</div>
      <div>{dateFormat.format(now)}</div>
    </div>
  );
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
    return <span className={styles.performanceReview}>PERFORMANCE REVIEW {formatClock(secondsUntil(endsAt, shift.clockOffsetMs))}</span>;
  }
  return <span>OFF DUTY</span>;
}
