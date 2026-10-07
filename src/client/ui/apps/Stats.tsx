// Stats app: banked money, calls, success rate, shifts, level, and a bar showing the XP
// earned towards the next level. Placeholder values until stats arrive (steps 5-7).

import type { ReactElement } from "react";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import app from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/Stats.module.css";

const Rows: readonly { label: string; value: string }[] = [
  { label: "Money in the bank", value: "$0" },
  { label: "Calls completed", value: "0" },
  { label: "Success rate", value: "--" },
  { label: "Shifts passed / failed", value: "0 / 0" },
  { label: "Level", value: "1" },
  { label: "Level progress", value: "0 / -- XP" },
];

export function Stats(): ReactElement {
  return (
    <div className={app.app}>
      <dl className={cx(controls.sunken, styles.table)}>
        {Rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div
        className={cx(controls.sunken, styles.xpTrack)}
        role="progressbar"
        aria-label="XP towards the next level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
      >
        <div className={styles.xpFill} />
      </div>
    </div>
  );
}
