// The red count on an app's desktop icon and taskbar button, like unread emails on a real
// mail app. Only Email has one so far.

import type { ReactElement } from "react";
import type { AppId } from "@client/ui/appList";
import { useUnreadMail } from "@client/state/mailStore";
import styles from "@client/ui/AppBadge.module.css";

// Bigger counts show as "9+".
const MaxShown = 9;

/** The number to show on app `id`'s badge; 0 for none. */
function useBadgeCount(id: AppId): number {
  const unreadMail = useUnreadMail();
  return id === "Email" ? unreadMail : 0;
}

/** Sits in the top right corner of its (positioned) parent. Nothing when the count is 0. */
export function AppBadge({ id }: { id: AppId }): ReactElement | null {
  const count = useBadgeCount(id);
  if (count === 0) {
    return null;
  }
  return (
    <span className={styles.badge} aria-label={`${count} unread`}>
      {count > MaxShown ? `${MaxShown}+` : count}
    </span>
  );
}
