// Redeem app: type in a card code from a call to cash it in. Placeholder until codes arrive
// (step 4): nothing is sent yet.

import type { ReactElement } from "react";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import app from "@client/ui/apps/appStyles.module.css";

export function Redeem(): ReactElement {
  return (
    <div className={app.app}>
      <p className={app.heading}>CARD REDEEMER 2000</p>
      <label className={app.formRow}>
        Card code:
        <input
          className={cx(controls.field, app.mono)}
          type="text"
          placeholder="XXX-XXX"
          disabled
        />
      </label>
      <div className={app.row}>
        <span className={app.muted}>Tries left: -</span>
        <button type="button" className={controls.button} disabled>
          Redeem
        </button>
      </div>
      <p className={cx(controls.sunken, app.status)}>
        Get a code out of a caller, then cash it in here.
      </p>
    </div>
  );
}
