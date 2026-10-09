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

/** A request for the Email app to show one email (e.g. a notification was clicked). `seq`
 * goes up with every request, so asking for the same email twice still counts. */
export interface MailRequest {
  id: number;
  seq: number;
}

const mailRequest = createStore<MailRequest | null>(null);
// Never reset (clearing a request doesn't), so every request gets a new seq.
let lastSeq = 0;

/** Asks the Email app to show email `id` (open the app too). */
export function requestMail(id: number): void {
  lastSeq += 1;
  mailRequest.set({ id, seq: lastSeq });
}

/** Called by the Email app once it has followed the request. */
export function clearMailRequest(): void {
  if (mailRequest.get() !== null) {
    mailRequest.set(null);
  }
}

/** The email the Email app has been asked to show, if any. */
export function useMailRequest(): MailRequest | null {
  return useStore(mailRequest);
}
