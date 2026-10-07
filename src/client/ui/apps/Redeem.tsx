// Redeem app: type in a card code from a call to cash it in. The server checks the code and
// decides the payout; this only sends what was typed and shows the answer.

import { type FormEvent, type ReactElement, useState } from "react";
import { codePlaceholder } from "@shared/cardCode";
import { Config } from "@shared/Config";
import { redeemCode } from "@client/net/redeemActions";
import { useConnection } from "@client/state/connectionStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import app from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/Redeem.module.css";

const IdleStatus = "Get a code out of a caller, then cash it in here.";
const NoAnswer = "Couldn't reach the card company. Try again.";

type Tone = "idle" | "success" | "error";

interface Status {
  text: string;
  tone: Tone;
}

export function Redeem(): ReactElement {
  const online = useConnection().status === "connected";
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<Status>({ text: IdleStatus, tone: "idle" });
  // Tries left for the card the last answer was about; null when it wasn't about one that
  // can still be tried (cashed in, or nothing matched).
  const [triesLeft, setTriesLeft] = useState<number | null>(null);
  const canRedeem = online && !checking && code.trim() !== "";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canRedeem) {
      return;
    }
    setChecking(true);
    setStatus({ text: "Checking...", tone: "idle" });
    const result = await redeemCode(code);
    setChecking(false);
    if (!result) {
      setStatus({ text: NoAnswer, tone: "error" });
      return;
    }
    setStatus({ text: result.message, tone: result.success ? "success" : "error" });
    setTriesLeft(result.success ? null : result.triesRemaining);
    if (result.success) {
      setCode("");
    }
  }

  return (
    <form className={app.app} onSubmit={(event) => void submit(event)}>
      <p className={app.heading}>CARD REDEEMER 2000</p>
      <label className={app.formRow}>
        Card code:
        <input
          className={cx(controls.field, app.mono)}
          type="text"
          value={code}
          maxLength={Config.Redeem.MaxCodeInputLength}
          placeholder={codePlaceholder()}
          autoComplete="off"
          spellCheck={false}
          // Locked while the server checks, so nothing typed meanwhile is wiped on success.
          readOnly={checking}
          onChange={(event) => setCode(event.target.value)}
        />
      </label>
      <div className={app.row}>
        <span className={app.muted}>Tries left: {triesLeft ?? "-"}</span>
        <button type="submit" className={controls.button} disabled={!canRedeem}>
          Redeem
        </button>
      </div>
      <p
        className={cx(controls.sunken, app.status, styles[status.tone])}
        role="status"
        aria-live="polite"
      >
        {status.text}
      </p>
    </form>
  );
}
