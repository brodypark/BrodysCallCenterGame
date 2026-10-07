// Call app: the conversation with the victim, styled as a dark phone app that looks the same
// in every desktop theme. From the top: the Caller Trust bar, the caller (name, face and a
// status line that doubles as the turn indicator), the chat log, the typed message box, and
// Hang Up, speaker and hold-to-talk buttons. Placeholder until calls arrive (step 2):
// nothing works yet. The face is drawn in step 11.

import type { ReactElement } from "react";
import { cx } from "@client/ui/classNames";
import styles from "@client/ui/apps/Call.module.css";

export function Call(): ReactElement {
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
          aria-valuetext="No caller"
        >
          <div className={styles.trustFill} />
        </div>
      </section>

      <section className={cx(styles.panel, styles.caller)} aria-label="Caller">
        <div className={styles.nameBand}>No caller</div>
        <div className={styles.faceArea}>
          <span className={styles.noFace}>?</span>
        </div>
        <div className={styles.statusBand}>Not on a call</div>
      </section>

      <section className={cx(styles.panel, styles.chat)} aria-label="Conversation">
        <p className={styles.chatHint}>Subtitles for both sides of the call show up here.</p>
      </section>

      <div className={styles.inputRow}>
        <input
          className={styles.input}
          type="text"
          placeholder="Type a message..."
          aria-label="Message"
          disabled
        />
        <button type="button" className={cx(styles.button, styles.send)} disabled>
          Send
        </button>
      </div>

      <div className={styles.buttonRow}>
        <button type="button" className={cx(styles.button, styles.hangUp)} disabled>
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
