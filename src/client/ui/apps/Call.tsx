// Call app: the conversation with the victim, styled as a dark phone app that looks the same
// in every desktop theme. From the top: the Caller Trust bar, the caller (name, face and a
// status line), the chat log, the typed message box, and Hang Up, speaker and hold-to-talk
// buttons. It opens by itself when a call is answered. The trust bar arrives in step 4, the
// turn indicator in step 3, voice in steps 9-10 and the face in step 11.

import { type FormEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { Config } from "@shared/Config";
import { cleanMessage } from "@shared/messageText";
import type { CallEndReason, CallSnapshot, ChatMessage } from "@shared/types";
import { hangUp, sendMessage } from "@client/net/callActions";
import { useCall } from "@client/state/callStore";
import { useConnection } from "@client/state/connectionStore";
import { cx } from "@client/ui/classNames";
import styles from "@client/ui/apps/Call.module.css";

// The status line after each way a call can end, also shown at the end of its chat.
const OutcomeText: Record<CallEndReason, string> = {
  playerHungUp: "You hung up",
  declined: "Call declined",
  missed: "Missed call",
};

function statusText(call: CallSnapshot): string {
  switch (call.status) {
    case "ringing":
      return "Incoming call...";
    case "inCall":
      return "On the line";
    case "idle":
      return call.lastOutcome ? OutcomeText[call.lastOutcome] : "Not on a call";
  }
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
  const canSend = canAct && cleanMessage(draft) !== null;

  // Keep the newest message (or the line saying how the call ended) in view.
  const endReason = transcript?.endReason ?? null;
  useEffect(() => {
    const log = logRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages.length, endReason]);

  // Ready to type as soon as a call is answered.
  useEffect(() => {
    if (inCall) {
      inputRef.current?.focus();
    }
  }, [inCall]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = cleanMessage(draft);
    if (!canAct || text === null) {
      return;
    }
    sendMessage(text);
    setDraft("");
  }

  return (
    <div className={styles.call}>
      <section className={cx(styles.panel, styles.trust)} aria-label="Caller trust">
        <div className={styles.trustHeader}>
          <span className={styles.trustTitle}>CALLER TRUST</span>
          <span className={styles.trustWord}>--</span>
        </div>
        <div
          className={styles.trustTrack}
          role="progressbar"
          aria-label="Caller trust"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext="Unknown"
        >
          <div className={styles.trustFill} />
        </div>
      </section>

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
          disabled={!canAct}
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
