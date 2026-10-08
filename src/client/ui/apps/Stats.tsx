// Stats app: banked money, calls, success rate, shifts, the level, and a bar showing the XP
// earned towards the next level.

import type { ReactElement } from "react";
import { levelProgress } from "@shared/Levels";
import type { PlayerStats } from "@shared/stats";
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
    { label: "Level", value: String(levelProgress(stats.xp).level) },
  ];
}

export function Stats(): ReactElement {
  const stats = useStats();
  const progress = levelProgress(stats.xp);
  const percent = Math.round((progress.xpIntoLevel / progress.xpForNextLevel) * Percent);

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
      <p className={styles.xpLabel}>
        {progress.xpIntoLevel} / {progress.xpForNextLevel} XP to level {progress.level + 1}
      </p>
      <div
        className={cx(controls.sunken, styles.xpTrack)}
        role="progressbar"
        aria-label={`XP towards level ${progress.level + 1}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={styles.xpFill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
