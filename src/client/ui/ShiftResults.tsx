// The report card when a shift ends: calls taken, earnings against the quota, XP, and a
// PROMOTED or FIRED stamp that slams down a moment after it opens, with a jingle (and
// another if the player levelled up). Closing it goes back to the title menu.

import { type ReactElement, useEffect } from "react";
import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import { dismissShiftResult, useShift } from "@client/state/shiftStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import { Stamp } from "@client/ui/Effects";
import { playSound } from "@client/ui/sounds";
import styles from "@client/ui/ShiftResults.module.css";

/** The report's sounds: the stamp landing with its jingle, then the level-up one. */
function useReportSounds(passed: boolean | null, levelledUp: boolean): void {
  useEffect(() => {
    if (passed === null) {
      return;
    }
    const { ReportStampDelaySeconds, SlamSeconds, LevelUpJingleDelaySeconds } = Config.Effects;
    // Under reduced motion the stamp is just there, so it sounds straight away.
    const stillMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const landsAt = stillMotion ? 0 : ReportStampDelaySeconds + SlamSeconds;
    const timers = [
      setTimeout(() => {
        playSound("stamp");
        playSound(passed ? "promoted" : "fired");
      }, secondsToMs(landsAt)),
    ];
    if (levelledUp) {
      timers.push(
        setTimeout(() => playSound("level-up"), secondsToMs(landsAt + LevelUpJingleDelaySeconds)),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [passed, levelledUp]);
}

export function ShiftResults(): ReactElement | null {
  const { result } = useShift();
  useReportSounds(result?.passed ?? null, result?.newLevel != null);
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
        {result.newLevel !== null && (
          <div className={styles.levelUp}>
            <p className={styles.levelUpTitle}>LEVEL UP! Level {result.newLevel}</p>
            {result.unlockedCallers.map((name) => (
              <p key={name}>New caller: {name}</p>
            ))}
          </div>
        )}
        <Stamp
          text={result.passed ? "PROMOTED" : "FIRED"}
          tone={result.passed ? "good" : "bad"}
          delaySeconds={Config.Effects.ReportStampDelaySeconds}
        />
        <button type="button" className={controls.button} onClick={dismissShiftResult} autoFocus>
          Continue
        </button>
      </section>
    </div>
  );
}
