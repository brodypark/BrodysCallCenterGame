// Call app: the conversation with the victim, styled as a dark phone app that looks the same
// in every desktop theme. From the top: the Caller Trust bar, the caller (name, face and a
// status line saying whose turn it is), the chat log, the typed message box, and Hang Up,
// speaker and hold-to-talk buttons. It opens by itself when a call is answered. Voice
// arrives in steps 9-10 and the face in step 11.

import { type FormEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { Config } from "@shared/Config";
import { cleanMessage } from "@shared/messageText";
import type { CallEndReason, CallSnapshot, ChatMessage, TrustMeter } from "@shared/types";
import { hangUp, sendMessage } from "@client/net/callActions";
import { useCall } from "@client/state/callStore";
import { useConnection } from "@client/state/connectionStore";
import { cx } from "@client/ui/classNames";
import styles from "@client/ui/apps/Call.module.css";

// The status line after each way a call can end, also shown at the end of its chat.
const OutcomeText: Record<CallEndReason, string> = {
  playerHungUp: "You hung up",
  victimHungUp: "They hung up on you",
  declined: "Call declined",
  missed: "Missed call",
};

// The yellow line under the face: what's happening on the call right now.
function statusText(call: CallSnapshot): string {
  const name = (call.caller ?? "The caller").toUpperCase();
  switch (call.turn) {
    case "playerTurn":
      return call.codeRevealed
        ? "GOT THE CODE! HANG UP AND REDEEM IT"
        : `YOUR TURN · TURN ${call.playerTurns + 1}`;
    case "processing":
      return `${name} IS THINKING...`;
    case "victimTurn":
      return `${name} IS TALKING...`;
    case null:
      break;
  }
  if (call.status === "ringing") {
    return "INCOMING CALL - ANSWER IN THE PHONE";
  }
  return call.lastOutcome ? OutcomeText[call.lastOutcome].toUpperCase() : "WAITING FOR A CALL...";
}

export function Call(): ReactElement {
  const call = useCall();
  const online = useConnection().status === "connected";
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const inCall = call.status === "inCall";
  // Only usable while connected: anything sent offline would be dropped.
  const canAct = inCall && online;
  // Typing (and talking) is only for the player's turn.
  const canType = canAct && call.turn === "playerTurn";
  // Puts the cursor back in the message box when the player's turn comes: after answering,
  // and after sending a message from the box.
  const wantsFocus = useRef(false);

  // A half-typed message doesn't carry over into the next call.
  const [wasInCall, setWasInCall] = useState(inCall);
  if (inCall !== wasInCall) {
    setWasInCall(inCall);
    if (!inCall) {
      setDraft("");
    }
  }
  const transcript = call.transcript;
  const messages = transcript?.messages ?? [];
  const callerName = call.caller ?? transcript?.callerName ?? "No caller";
  const canSend = canType && cleanMessage(draft) !== null;

  // Keep the newest message (or the line saying how the call ended) in view.
  const endReason = transcript?.endReason ?? null;
  useEffect(() => {
    const log = logRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages.length, endReason]);

  useEffect(() => {
    if (inCall) {
      wantsFocus.current = true;
    }
  }, [inCall]);

  useEffect(() => {
    if (!canType || !wantsFocus.current) {
      return;
    }
    wantsFocus.current = false;
    // Only if the player hasn't moved on to something else, like typing in another app.
    const active = document.activeElement;
    if (active === null || active === document.body || active === inputRef.current) {
      inputRef.current?.focus();
    }
  }, [canType]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = cleanMessage(draft);
    if (!canType || text === null) {
      return;
    }
    sendMessage(text);
    setDraft("");
    wantsFocus.current = true;
  }

  return (
    <div className={styles.call}>
      <TrustBar trust={call.trust} />

      <section className={cx(styles.panel, styles.caller)} aria-label="Caller">
        <div className={styles.nameBand}>{callerName}</div>
        <div className={styles.faceArea}>
          <span className={styles.noFace}>?</span>
        </div>
        <div className={styles.statusBand} aria-live="polite">
          {statusText(call)}
        </div>
      </section>

      <section className={cx(styles.panel, styles.chat)} aria-label="Conversation">
        <div ref={logRef} className={styles.log} aria-live="polite">
          {messages.length === 0 ? (
            <p className={styles.chatHint}>Subtitles for both sides of the call show up here.</p>
          ) : (
            messages.map((message, index) => (
              <Bubble key={index} message={message} callerName={transcript?.callerName ?? ""} />
            ))
          )}
          {endReason && <p className={styles.systemLine}>{OutcomeText[endReason]}.</p>}
        </div>
      </section>

      <form className={styles.inputRow} onSubmit={submit}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={draft}
          maxLength={Config.Call.MaxTypedMessageLength}
          placeholder={inCall ? "Type a message..." : "Not on a call"}
          aria-label="Message"
          disabled={!canType}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className={cx(styles.button, styles.send)} disabled={!canSend}>
          Send
        </button>
      </form>

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={cx(styles.button, styles.hangUp)}
          disabled={!canAct}
          onClick={hangUp}
        >
          Hang Up
        </button>
        <button
          type="button"
          className={cx(styles.button, styles.round)}
          aria-label="Mute the caller"
          disabled
        >
          🔊
        </button>
        <button
          type="button"
          className={cx(styles.button, styles.round)}
          aria-label="Hold to talk"
          disabled
        >
          🎤
        </button>
      </div>
    </div>
  );
}

function Bubble({
  message,
  callerName,
}: {
  message: ChatMessage;
  callerName: string;
}): ReactElement {
  const fromPlayer = message.speaker === "player";
  return (
    <div className={cx(styles.bubble, fromPlayer ? styles.playerBubble : styles.victimBubble)}>
      <span className={styles.tag}>{fromPlayer ? "You" : callerName}</span>
      <span>{message.text}</span>
    </div>
  );
}

/** How much the caller trusts the player, the word for it, and the line trust must climb
 * past before they'll read out the code. All worked out on the server. */
function TrustBar({ trust }: { trust: TrustMeter | null }): ReactElement {
  return (
    <section
      className={cx(styles.panel, styles.trust, trust && styles[trust.word])}
      aria-label="Caller trust"
    >
      <div className={styles.trustHeader}>
        <span className={styles.trustTitle}>CALLER TRUST</span>
        <span className={styles.trustWord}>
          {trust ? `${trust.word.toUpperCase()} · ${trust.percent}%` : "--"}
        </span>
      </div>
      <div
        className={styles.trustTrack}
        role="progressbar"
        aria-label="Caller trust"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={trust?.percent}
        aria-valuetext={trust ? `${trust.percent}%, ${trust.word}` : "No caller"}
      >
        <div className={styles.trustFill} style={{ width: `${trust?.percent ?? 0}%` }} />
        {trust && <div className={styles.trustMarker} style={{ left: `${trust.revealAt}%` }} />}
      </div>
    </section>
  );
}
