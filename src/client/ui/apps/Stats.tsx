// Stats app: banked money, calls, success rate, shifts and XP. Levels and the XP bar arrive
// in step 7.

import type { ReactElement } from "react";
import type { PlayerStats } from "@shared/types";
import { useStats } from "@client/state/statsStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import app from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/Stats.module.css";

const Percent = 100;

function rows(stats: PlayerStats): readonly { label: string; value: string }[] {
  const successRate =
    stats.callsCompleted === 0
      ? "--"
      : `${Math.round((stats.successfulCalls / stats.callsCompleted) * Percent)}%`;
  return [
    { label: "Money in the bank", value: `$${stats.money}` },
    { label: "Calls completed", value: String(stats.callsCompleted) },
    { label: "Success rate", value: successRate },
    { label: "Shifts passed / failed", value: `${stats.shiftsPassed} / ${stats.shiftsFailed}` },
    { label: "XP", value: String(stats.xp) },
  ];
}

export function Stats(): ReactElement {
  const stats = useStats();

  return (
    <div className={app.app}>
      <dl className={cx(controls.sunken, styles.table)}>
        {rows(stats).map((row) => (
          <div key={row.label} className={styles.row}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
