// Phone app: shows who's calling, with Answer and Decline buttons. Placeholder until calls
// arrive (step 2): it shows the off-duty screen and the buttons don't work yet.

import type { ReactElement } from "react";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import styles from "@client/ui/apps/Phone.module.css";

export function Phone(): ReactElement {
  return (
    <div className={styles.phone}>
      <div className={cx(controls.sunken, styles.screen)}>
        <p className={styles.status}>OFF DUTY</p>
        <p className={styles.caller}>CALLER: ---</p>
        <p className={styles.hint}>Clock in to start taking calls.</p>
      </div>
      <div className={styles.buttons}>
        <button type="button" className={cx(controls.button, styles.answer)} disabled>
          Answer
        </button>
        <button type="button" className={cx(controls.button, styles.decline)} disabled>
          Decline
        </button>
      </div>
    </div>
  );
}
