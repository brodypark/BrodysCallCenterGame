// A stinky aroma for the facecam: green wisps rising off the head and two flies buzzing
// round it (StinkCloud, drawn in a box the facecam moves with the head), and a green
// haze over the whole picture (StinkHaze). Decoration only.

import type { ReactElement } from "react";
import { cx } from "@client/ui/classNames";
import styles from "@client/ui/StinkCloud.module.css";

// Where each wisp rises from (percent across the face's box) and when it starts, in seconds.
const Wisps = [
  { left: 24, delay: 0 },
  { left: 44, delay: 0.8 },
  { left: 64, delay: 1.6 },
] as const;

export function StinkCloud(): ReactElement {
  return (
    <div className={styles.cloud} aria-hidden="true">
      {Wisps.map((wisp) => (
        <svg
          key={wisp.left}
          className={styles.wisp}
          style={{ left: `${wisp.left}%`, animationDelay: `${wisp.delay}s` }}
          viewBox="0 0 10 40"
        >
          <path d="M 5 40 Q 1 35 5 30 T 5 20 T 5 10 T 5 0" />
        </svg>
      ))}
      <div className={styles.orbit}>
        <span className={styles.fly} />
      </div>
      <div className={cx(styles.orbit, styles.wideOrbit)}>
        <span className={styles.fly} />
      </div>
    </div>
  );
}

export function StinkHaze(): ReactElement {
  return <div className={styles.haze} aria-hidden="true" />;
}
