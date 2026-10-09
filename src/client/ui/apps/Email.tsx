// Email: the player's inbox, newest first, with the open email beside it. The server writes
// every email and decides when they arrive (MailService); opening one marks it read. It
// opens by itself on the boss's welcome (useMailPopup), starting on that email, and jumps to
// an email whose notification was clicked (requestMail).

import { type ReactElement, useEffect, useState } from "react";
import type { MailMessage, MailSnapshot } from "@shared/types";
import { readMail } from "@client/net/mailActions";
import { useConnection } from "@client/state/connectionStore";
import {
  clearMailRequest,
  mailStore,
  unreadCount,
  useMail,
  useMailRequest,
} from "@client/state/mailStore";
import { useGameMode } from "@client/state/savesStore";
import { cx } from "@client/ui/classNames";
import { senderName } from "@client/ui/mailRules";
import app from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/Email.module.css";

// e.g. "Oct 8, 9:05 PM", in the player's own language and time zone.
const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** The email to open first: the one that opened the app by itself, else the newest unread
 * one, else the newest. */
function firstToOpen(snapshot: MailSnapshot): number | null {
  const { messages, autoOpenId } = snapshot;
  const message =
    messages.find((each) => each.id === autoOpenId) ??
    messages.find((each) => !each.read) ??
    messages[0];
  return message?.id ?? null;
}

function Reader({ message }: { message: MailMessage }): ReactElement {
  return (
    <article className={styles.reader}>
      <header className={styles.readerHeader}>
        <h2 className={styles.subject}>{message.subject}</h2>
        <p className={styles.meta}>
          <span className={styles.metaLabel}>From:</span> {message.from}
        </p>
        <p className={styles.meta}>
          <span className={styles.metaLabel}>Sent:</span> {dateFormat.format(message.sentAt)}
        </p>
      </header>
      <div className={styles.body}>{message.body}</div>
    </article>
  );
}

export function Email(): ReactElement {
  const snapshot = useMail();
  const { messages } = snapshot;
  const sandbox = useGameMode() === "sandbox";
  // Picked once when the window opens; after that, only clicking (here or on a notification)
  // changes it, so emails that arrive while it's open don't get marked read without being
  // seen.
  const request = useMailRequest();
  const [selectedId, setSelectedId] = useState<number | null>(
    () => request?.id ?? firstToOpen(mailStore.get()),
  );
  const [followedSeq, setFollowedSeq] = useState(request?.seq ?? null);
  if (request && request.seq !== followedSeq) {
    setFollowedSeq(request.seq);
    setSelectedId(request.id);
  }
  useEffect(() => {
    if (request) {
      clearMailRequest();
    }
  }, [request]);
  const selected = messages.find((each) => each.id === selectedId) ?? null;
  const unreadSelected = selected && !selected.read ? selected.id : null;
  // Tried again on reconnecting, in case it was dropped while offline.
  const connected = useConnection().status === "connected";

  useEffect(() => {
    if (unreadSelected !== null && connected) {
      readMail(unreadSelected);
    }
  }, [unreadSelected, connected]);

  if (messages.length === 0) {
    return (
      <div className={cx(app.app, styles.empty)}>
        <p className={app.muted}>
          {sandbox ? "No mail in Sandbox. Even the boss takes a day off." : "No mail yet."}
        </p>
      </div>
    );
  }

  const unread = unreadCount(snapshot);
  return (
    <div className={app.app}>
      <div className={app.row}>
        <span className={styles.folder}>📥 Inbox</span>
        <span className={app.muted}>{unread === 0 ? "All read" : `${unread} unread`}</span>
      </div>
      <div className={styles.panes}>
        <ul className={styles.list} aria-label="Inbox">
          {messages.map((message) => (
            <li key={message.id}>
              <button
                type="button"
                className={cx(
                  styles.item,
                  !message.read && styles.unread,
                  message.id === selectedId && styles.selected,
                )}
                aria-current={message.id === selectedId ? "true" : undefined}
                onClick={() => setSelectedId(message.id)}
              >
                <span className={styles.itemTop}>
                  <span className={styles.sender}>{senderName(message.from)}</span>
                  <span className={styles.date}>{dateFormat.format(message.sentAt)}</span>
                </span>
                <span className={styles.itemSubject}>{message.subject}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <Reader message={selected} />
        ) : (
          <div className={cx(styles.reader, styles.nothingOpen)}>
            <p className={app.muted}>Pick an email to read it.</p>
          </div>
        )}
      </div>
    </div>
  );
}
