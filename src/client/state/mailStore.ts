// The client's copy of the player's inbox, as the server last sent it.

import type { MailSnapshot } from "@shared/types";
import { socket } from "@client/net/socket";
import { createStore, useStore } from "@client/state/createStore";

const mail = createStore<MailSnapshot>({ messages: [], autoOpenId: null });

function onSnapshot(snapshot: MailSnapshot): void {
  mail.set(snapshot);
}

socket.on("mail:snapshot", onSnapshot);

// When Vite hot-reloads this module in development, remove the old copy's listener.
import.meta.hot?.dispose(() => {
  socket.off("mail:snapshot", onSnapshot);
});

/** The latest inbox, and changes to it, for code outside React (e.g. sound cues). */
export const mailStore: Pick<typeof mail, "get" | "subscribe"> = mail;

/** How many emails in `snapshot` haven't been opened. */
export function unreadCount(snapshot: MailSnapshot): number {
  return snapshot.messages.filter((message) => !message.read).length;
}

/** The highest email id in `snapshot`, or -1 if it's empty. Ids only go up within a save, so
 * a higher one means new mail (even when a full inbox drops an old email to fit it). */
export function newestId(snapshot: MailSnapshot): number {
  return Math.max(-1, ...snapshot.messages.map((message) => message.id));
}

/** The latest inbox; re-renders the component when it changes. */
export function useMail(): MailSnapshot {
  return useStore(mail);
}

/** How many emails haven't been opened; re-renders the component when it changes. */
export function useUnreadMail(): number {
  return unreadCount(useMail());
}
