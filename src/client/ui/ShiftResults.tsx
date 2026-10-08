// The report card when a shift ends: calls taken, earnings against the quota, XP, and a
// PROMOTED or FIRED stamp. Closing it goes back to the time card. (Step 11 adds the stamp
// slam and sounds.)

import type { ReactElement } from "react";
import { dismissShiftResult, useShift } from "@client/state/shiftStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import styles from "@client/ui/ShiftResults.module.css";

export function ShiftResults(): ReactElement | null {
  const { result } = useShift();
  if (!result) {
    return null;
  }

  const rows: readonly [string, string][] = [
    ["Calls taken", String(result.callsTaken)],
    ["Cards cashed in", String(result.successfulCalls)],
    ["Earnings", `$${result.earnings} / $${result.quota}`],
    [result.passed ? "Banked" : "Lost", `$${result.earnings}`],
    ["XP earned", `+${result.xpEarned}`],
  ];

  return (
    <div className={styles.shade}>
      <section
        className={cx(controls.raised, styles.card)}
        role="dialog"
        aria-labelledby="shift-results-title"
      >
        <p id="shift-results-title" className={styles.title}>
          SHIFT REPORT
        </p>
        <dl className={cx(controls.sunken, styles.rows)}>
          {rows.map(([label, value]) => (
            <div key={label} className={styles.row}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className={cx(styles.stamp, result.passed ? styles.promoted : styles.fired)}>
          {result.passed ? "PROMOTED" : "FIRED"}
        </p>
        <button type="button" className={controls.button} onClick={dismissShiftResult} autoFocus>
          Back to the desk
        </button>
      </section>
    </div>
  );
}
