// Call app: the conversation with the victim, styled as a dark phone app that looks the same
// in every desktop theme. From the top: the Caller Trust bar, the caller (name, face and a
// status line saying whose turn it is), the chat log, the typed message box, and Hang Up,
// speaker and hold-to-talk buttons. It opens by itself when a call is answered. Holding V
// (outside the message box) or the talk button talks; the words show as a "Listening..."
// bubble and send when it's let go. The caller's face shows their mood and talks with
// their voice; big trust swings flash the bar and make it react, and a victim hanging up
// slams a CALL ENDED stamp on the window.

import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { Config } from "@shared/Config";
import { cleanMessage } from "@shared/messageText";
import type {
  CallEndReason,
  CallSnapshot,
  ChatMessage,
  ShiftStatus,
  TrustMeter,
} from "@shared/types";
import { hangUp, sendMessage } from "@client/net/callActions";
import { useCall } from "@client/state/callStore";
import { useConnection } from "@client/state/connectionStore";
import { useGameMode } from "@client/state/savesStore";
import { useShift } from "@client/state/shiftStore";
import { cx } from "@client/ui/classNames";
import { Stamp } from "@client/ui/Effects";
import { Face } from "@client/ui/Face";
import { moodFor } from "@client/ui/faceParts";
import { type TrustSwing, useTrustReaction } from "@client/ui/apps/useTrustReaction";
import { usePushToTalkKey } from "@client/ui/usePushToTalkKey";
import {
  cancelTalking,
  startTalking,
  stopTalking,
  usePlayerVoice,
} from "@client/voice/PlayerVoice";
import { setVictimMuted, useVictimMuted } from "@client/voice/VictimVoice";
import styles from "@client/ui/apps/Call.module.css";

// The status line after each way a call can end, also shown at the end of its chat.
const OutcomeText: Record<CallEndReason, string> = {
  playerHungUp: "You hung up",
  victimHungUp: "They hung up on you",
  victimSaidGoodbye: "They said goodbye",
  shiftEnded: "Cut off: the shift is over",
  declined: "Call declined",
  missed: "Missed call",
};

// The yellow line under the face: what's happening on the call right now. Sandbox has no
// shifts, and its calls only ring from the Control Panel.
function statusText(call: CallSnapshot, shift: ShiftStatus, sandbox: boolean): string {
  const name = (call.caller ?? "The caller").toUpperCase();
  switch (call.turn) {
    case "playerTurn":
      if (call.codeRevealed) {
        return "GOT THE CODE! HANG UP AND REDEEM IT";
      }
      return shift === "overtime"
        ? "OVERTIME! REPLY SOON OR GET CUT OFF"
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
  if (sandbox) {
    return call.lastOutcome
      ? `${OutcomeText[call.lastOutcome].toUpperCase()} · RING ANOTHER IN THE CONTROL PANEL`
      : "RING A CALL IN THE CONTROL PANEL";
  }
  if (shift === "offShift") {
    return "OFF DUTY - CLOCK IN FIRST";
  }
  if (shift === "overtime") {
    return "OVERTIME - NO MORE CALLS";
  }
  return call.lastOutcome ? OutcomeText[call.lastOutcome].toUpperCase() : "WAITING FOR A CALL...";
}

export function Call(): ReactElement {
  const call = useCall();
  const shift = useShift().snapshot.status;
  const sandbox = useGameMode() === "sandbox";
  const online = useConnection().status === "connected";
  const [draft, setDraft] = useState("");
  const muted = useVictimMuted();
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const talkRef = useRef<HTMLButtonElement>(null);
  const voice = usePlayerVoice();

  const inCall = call.status === "inCall";
  // Only usable while connected: anything sent offline would be dropped.
  const canAct = inCall && online;
  // Typing (and talking) is only for the player's turn.
  const canType = canAct && call.turn === "playerTurn";
  // Puts the cursor back in the message box when the player's turn comes: after sending a
  // message from the box, and after answering or voice failing when voice can't be used.
  // Otherwise the box stays out of the way, so holding V talks.
  const wantsFocus = useRef(false);
  const talking = voice.status !== "idle";
  usePushToTalkKey(canType);
  const reaction = useTrustReaction(call.trust);

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
  // Which call ending this is, and the one already over when the window opened: only a
  // hang-up seen happen gets the CALL ENDED stamp, not one from before it was reopened.
  const endingKey = endReason === null ? null : `${callerName}-${messages.length}-${endReason}`;
  const [endingAtOpen] = useState(endingKey);
  const stampCallEnded = endReason === "victimHungUp" && endingKey !== endingAtOpen;
  useEffect(() => {
    const log = logRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages.length, endReason, talking, voice.heard]);

  useEffect(() => {
    if (inCall) {
      wantsFocus.current = !voice.available;
    }
  }, [inCall, voice.available]);

  useEffect(() => {
    if (!canType || !wantsFocus.current) {
      return;
    }
    wantsFocus.current = false;
    // Only if the player hasn't moved on to something else, like typing in another app.
    const active = document.activeElement;
    if (
      active === null ||
      active === document.body ||
      active === inputRef.current ||
      active === talkRef.current
    ) {
      inputRef.current?.focus();
    }
  }, [canType, voice.available]);

  // A talk can't outlive the window: a button held down when it closes never hears the let-go.
  useEffect(() => cancelTalking, []);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = cleanMessage(draft);
    if (!canType || text === null) {
      return;
    }
    // Typing wins over words still on their way, so only one message goes this turn.
    cancelTalking();
    sendMessage(text);
    setDraft("");
    wantsFocus.current = true;
  }

  // Escape leaves the message box, so holding V talks again.
  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  }

  function onTalkDown(event: PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) {
      return;
    }
    // Keeps the button hearing the pointer even if it slides off while held.
    event.currentTarget.setPointerCapture(event.pointerId);
    startTalking();
  }

  return (
    <div className={styles.call}>
      <TrustBar trust={call.trust} swing={reaction.swing} />

      <section className={cx(styles.panel, styles.caller)} aria-label="Caller">
        <div className={styles.nameBand}>{callerName}</div>
        <div className={styles.faceArea}>
          {call.face ? (
            <Face
              look={call.face}
              mood={reaction.mood ?? moodFor(call.trust?.word ?? "unsure")}
              speaking={call.turn === "victimTurn"}
            />
          ) : (
            <span className={styles.noFace}>?</span>
          )}
        </div>
        <div className={styles.statusBand} aria-live="polite">
          {statusText(call, shift, sandbox)}
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
          {talking && (
            <div className={cx(styles.bubble, styles.playerBubble, styles.listening)}>
              <span className={styles.tag}>
                {voice.status === "listening" ? "Listening..." : "Sending..."}
              </span>
              <span>{voice.heard || "..."}</span>
            </div>
          )}
          {endReason && <p className={styles.systemLine}>{OutcomeText[endReason]}.</p>}
        </div>
      </section>

      {voice.notice && (
        <p className={styles.notice} role="status">
          {voice.notice}
        </p>
      )}

      <form className={styles.inputRow} onSubmit={submit}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={draft}
          maxLength={Config.Call.MaxTypedMessageLength}
          placeholder={
            !inCall
              ? "Not on a call"
              : voice.available
                ? "Type, or Esc then hold V to talk..."
                : "Type a message..."
          }
          aria-label="Message"
          disabled={!canType}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onInputKeyDown}
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
          aria-label={muted ? "Unmute the caller" : "Mute the caller"}
          onClick={() => setVictimMuted(!muted)}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          ref={talkRef}
          type="button"
          className={cx(
            styles.button,
            styles.round,
            voice.available && styles.talk,
            talking && styles.live,
          )}
          aria-label="Hold to talk"
          aria-pressed={talking}
          title={voice.available ? "Hold to talk, or hold V" : "Voice is off here. Type instead."}
          disabled={!canType}
          onPointerDown={onTalkDown}
          onPointerUp={stopTalking}
          onPointerCancel={stopTalking}
          onLostPointerCapture={stopTalking}
          // A long press on a touch screen would otherwise open a menu.
          onContextMenu={(event) => event.preventDefault()}
        >
          🎤
        </button>
      </div>

      {stampCallEnded && (
        <div className={styles.stampLayer}>
          {/* A new key per call, so each hang-up slams it down again. */}
          <Stamp key={endingKey} text="CALL ENDED" tone="bad" fades />
        </div>
      )}
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
  // Replies from the script rather than the AI say so.
  const scripted = message.speaker === "victim" && message.scripted === true;
  return (
    <div className={cx(styles.bubble, fromPlayer ? styles.playerBubble : styles.victimBubble)}>
      <span className={styles.tags}>
        <span className={styles.tag}>{fromPlayer ? "You" : callerName}</span>
        {scripted && (
          <span className={cx(styles.tag, styles.scripted)} title="A scripted reply, not the AI">
            SCRIPTED
          </span>
        )}
      </span>
      <span>{message.text}</span>
    </div>
  );
}

/** How much the caller trusts the player, the word for it, and the line trust must climb
 * past before they'll read out the code. All worked out on the server. */
function TrustBar({
  trust,
  swing,
}: {
  trust: TrustMeter | null;
  // The latest big swing, which blinks the bar green (more trust) or red (less).
  swing: TrustSwing | null;
}): ReactElement {
  const { FlashSeconds, FlashCount } = Config.Effects;
  return (
    <section
      className={cx(styles.panel, styles.trust, trust && styles[trust.word])}
      aria-label="Caller trust"
    >
      {swing && (
        <div
          key={swing.id}
          className={cx(
            styles.trustFlash,
            swing.suspicionRose ? styles.flashBad : styles.flashGood,
          )}
          style={
            {
              "--flash-seconds": `${FlashSeconds * 2}s`,
              "--flash-count": FlashCount,
            } as CSSProperties
          }
        />
      )}
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
