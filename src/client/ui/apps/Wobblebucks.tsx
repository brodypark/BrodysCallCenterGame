// Wobblebucks Machine app: charge the Wobblebucks Card a caller read out after agreeing to
// pay a fee for their side problem. Placeholder until side problems arrive (step 12); the
// card box should then use upperCaseInput like Redeem's.

import type { ReactElement } from "react";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import app from "@client/ui/apps/appStyles.module.css";

export function Wobblebucks(): ReactElement {
  return (
    <div className={app.app}>
      <p className={app.heading}>WOBBLEBUCKS MACHINE 3000</p>
      <label className={app.formRow}>
        Wobblebucks Card:
        <input
          className={cx(controls.field, app.mono)}
          type="text"
          placeholder="WBK-XXX"
          disabled
        />
      </label>
      <label className={app.formRow}>
        Amount ($):
        <input
          className={controls.field}
          type="text"
          inputMode="numeric"
          placeholder="Whole dollars"
          disabled
        />
      </label>
      <div className={app.row}>
        <span className={app.muted}>Tries left: -</span>
        <button type="button" className={controls.button} disabled>
          Charge
        </button>
      </div>
      <p className={cx(controls.sunken, app.status)}>
        Charge a caller&apos;s Wobblebucks Card here.
      </p>
    </div>
  );
}
