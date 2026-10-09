// New-mail notifications: a card slides in at the bottom right of the desk, above the
// taskbar, with the sender, subject and the start of the email. Clicking it opens Email on
// that email; the x just hides it. Each one goes after Config.Toasts.ShowSeconds on screen.
// While the title menu, shift report or intro covers the desk they wait, so none are missed.
// Which emails get one is decided in ui/mailToasts.

import { type CSSProperties, type ReactElement, useEffect } from "react";
import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import { requestMail } from "@client/state/mailStore";
import { useDesktop } from "@client/ui/DesktopContext";
import { useIntroShown } from "@client/ui/introPlayer";
import { dismissToast, type MailToast, useMailToasts } from "@client/ui/mailToasts";
import { useTitleMenuShown } from "@client/ui/useTitleMenuShown";
import styles from "@client/ui/Toasts.module.css";

export function Toasts(): ReactElement | null {
  const { store } = useDesktop();
  const toasts = useMailToasts();
  const menuShown = useTitleMenuShown(store);
  const introShown = useIntroShown();
  if (menuShown || introShown || toasts.length === 0) {
    return null;
  }
  return (
    <div
      className={styles.toasts}
      style={{ "--slide-seconds": `${Config.Toasts.SlideSeconds}s` } as CSSProperties}
      aria-live="polite"
    >
      {toasts.slice(0, Config.Toasts.MaxShown).map((toast) => (
        <Toast
          key={toast.id}
          toast={toast}
          onOpen={() => {
            dismissToast(toast.id);
            requestMail(toast.id);
            store.openApp("Email");
          }}
        />
      ))}
    </div>
  );
}

function Toast({ toast, onOpen }: { toast: MailToast; onOpen: () => void }): ReactElement {
  // Starts when it's on screen, so time spent waiting behind a menu doesn't count.
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), secondsToMs(Config.Toasts.ShowSeconds));
    return () => clearTimeout(timer);
  }, [toast.id]);

  return (
    <div className={styles.toast} role="status">
      <button type="button" className={styles.open} onClick={onOpen}>
        <span className={styles.header}>
          <span className={styles.icon} aria-hidden="true">
            ✉️
          </span>
          <span className={styles.sender}>{toast.sender}</span>
        </span>
        <span className={styles.subject}>{toast.subject}</span>
        <span className={styles.snippet}>{toast.snippet}</span>
      </button>
      <button
        type="button"
        className={styles.close}
        aria-label="Dismiss notification"
        onClick={() => dismissToast(toast.id)}
      >
        ×
      </button>
    </div>
  );
}
