// Phone app: shows who's calling, with Answer and Decline buttons, and how the last call
// ended. It opens by itself when the phone rings.

import type { ReactElement } from "react";
import type { CallEndReason, CallSnapshot, ShiftStatus } from "@shared/types";
import { answerCall, declineCall } from "@client/net/callActions";
import { useCall } from "@client/state/callStore";
import { useConnection } from "@client/state/connectionStore";
import { useGameMode } from "@client/state/savesStore";
import { useShift } from "@client/state/shiftStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import styles from "@client/ui/apps/Phone.module.css";
import { useDesktop } from "@client/ui/DesktopContext";

// The screen's top line after each way a call can end.
const OutcomeText: Record<CallEndReason, string> = {
  playerHungUp: "CALL ENDED",
  victimHungUp: "THEY HUNG UP",
  victimSaidGoodbye: "THEY SAID BYE",
  shiftEnded: "SHIFT OVER",
  declined: "CALL DECLINED",
  missed: "MISSED CALL",
};

interface ScreenText {
  status: string;
  caller: string;
  hint: string;
}

// Sandbox has no shifts, and its calls only ring from the Control Panel.
function screenText(call: CallSnapshot, shift: ShiftStatus, sandbox: boolean): ScreenText {
  const caller = `CALLER: ${call.caller ?? "---"}`;
  if (call.status === "idle" && sandbox) {
    return { status: "SANDBOX", caller, hint: "Ring a call from the Control Panel." };
  }
  if (call.status === "idle" && shift === "offShift") {
    return { status: "OFF DUTY", caller, hint: "Clock in to start taking calls." };
  }
  if (call.status === "idle" && shift === "overtime") {
    return {
      status: "OVERTIME",
      caller: "NO MORE CALLS",
      hint: "Cash in any codes you still have!",
    };
  }
  switch (call.status) {
    case "ringing":
      return { status: "INCOMING CALL", caller, hint: "Answer before it stops ringing!" };
    case "inCall":
      return { status: "ON A CALL", caller, hint: "Talk to them in the Call window." };
    case "idle":
      return call.lastOutcome
        ? { status: OutcomeText[call.lastOutcome], caller, hint: "The next call is coming soon..." }
        : { status: "NO INCOMING CALLS", caller, hint: "Waiting for the phone to ring..." };
  }
}

export function Phone(): ReactElement {
  const { store } = useDesktop();
  const call = useCall();
  const online = useConnection().status === "connected";
  const ringing = call.status === "ringing";
  const shift = useShift().snapshot.status;
  const sandbox = useGameMode() === "sandbox";
  const text = screenText(call, shift, sandbox);

  return (
    <div className={styles.phone}>
      <div className={cx(controls.sunken, styles.screen)} aria-live="polite">
        <p className={cx(styles.status, ringing && styles.ringing)}>{text.status}</p>
        <p className={styles.caller}>{text.caller}</p>
        <p className={styles.hint}>{text.hint}</p>
      </div>
      <div className={styles.buttons}>
        <button
          type="button"
          className={cx(controls.button, styles.answer)}
          disabled={!ringing || !online}
          onClick={() => {
            answerCall();
            store.closeApp("Phone");
          }}
        >
          Answer
        </button>
        <button
          type="button"
          className={cx(controls.button, styles.decline)}
          disabled={!ringing || !online}
          onClick={declineCall}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
