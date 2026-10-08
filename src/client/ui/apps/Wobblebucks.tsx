// Wobblebucks Machine app: charge the Wobblebucks Card a caller read out after agreeing to
// pay to have their side problem fixed. Type the card and an amount; the server checks it
// against the card's hidden spending limit. Approved pays that amount; over the limit is
// declined and uses a try, and out of tries the card freezes. Gift card codes are sent to
// the Redeem app without costing a try.

import { type FormEvent, type ReactElement, useState } from "react";
import { Config } from "@shared/Config";
import { chargeCard } from "@client/net/redeemActions";
import { useConnection } from "@client/state/connectionStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import { CoinBurst } from "@client/ui/Effects";
import { playSound } from "@client/ui/sounds";
import { upperCaseInput } from "@client/ui/upperCaseInput";
import app from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/Redeem.module.css";

const IdleStatus = "Talk a caller into paying for a fix, then charge their card here.";
const NoAnswer = "Couldn't reach the Wobblebucks network. Try again.";
const CardPlaceholder = `${Config.Card.Prefix}-XXX`;

type Tone = "idle" | "success" | "error";

interface Status {
  text: string;
  tone: Tone;
}

/** The amount typed, as whole dollars, or null if it isn't one in range. */
function parseAmount(typed: string): number | null {
  const trimmed = typed.trim().replace(/^\$/, "");
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const amount = Number(trimmed);
  const { MinChargeAmount, MaxChargeAmount } = Config.Card;
  return amount >= MinChargeAmount && amount <= MaxChargeAmount ? amount : null;
}

export function Wobblebucks(): ReactElement {
  const online = useConnection().status === "connected";
  const [card, setCard] = useState("");
  const [amountText, setAmountText] = useState("");
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<Status>({ text: IdleStatus, tone: "idle" });
  // Tries left for the card the last answer was about; null when it wasn't about one that
  // can still be tried.
  const [triesLeft, setTriesLeft] = useState<number | null>(null);
  // Goes up by one per approved charge, so each throws a fresh burst of coins.
  const [charges, setCharges] = useState(0);
  const amount = parseAmount(amountText);
  const canCharge = online && !checking && card.trim() !== "" && amount !== null;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canCharge) {
      return;
    }
    setChecking(true);
    setStatus({ text: "Wobbling...", tone: "idle" });
    const result = await chargeCard(card, amount);
    setChecking(false);
    if (!result) {
      setStatus({ text: NoAnswer, tone: "error" });
      return;
    }
    setStatus({ text: result.message, tone: result.success ? "success" : "error" });
    setTriesLeft(result.success ? null : result.triesRemaining);
    if (result.success) {
      setCard("");
      setAmountText("");
      setCharges((count) => count + 1);
      playSound("ka-ching");
      playSound("coins");
    } else {
      playSound("wrong-code");
    }
  }

  return (
    <form className={app.app} onSubmit={(event) => void submit(event)}>
      <p className={app.heading}>WOBBLEBUCKS MACHINE 3000</p>
      <label className={app.formRow}>
        Wobblebucks Card:
        <input
          className={cx(controls.field, app.mono)}
          type="text"
          value={card}
          maxLength={Config.Redeem.MaxCodeInputLength}
          placeholder={CardPlaceholder}
          autoComplete="off"
          spellCheck={false}
          // Locked while the server checks, so nothing typed meanwhile is wiped on success.
          readOnly={checking}
          onChange={(event) => setCard(upperCaseInput(event.target))}
        />
      </label>
      <label className={app.formRow}>
        Amount ($):
        <input
          className={controls.field}
          type="text"
          inputMode="numeric"
          value={amountText}
          placeholder={`Whole dollars, ${Config.Card.MinChargeAmount} to ${Config.Card.MaxChargeAmount}`}
          autoComplete="off"
          readOnly={checking}
          onChange={(event) => setAmountText(event.target.value)}
        />
      </label>
      <div className={app.row}>
        <span className={app.muted}>Tries left: {triesLeft ?? "-"}</span>
        <span className={styles.redeemButton}>
          <button type="submit" className={controls.button} disabled={!canCharge}>
            Charge
          </button>
          {charges > 0 && <CoinBurst key={charges} seed={charges} />}
        </span>
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
