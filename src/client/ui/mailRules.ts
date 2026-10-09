// Plain rules for showing mail in short: the sender's name, and which emails get a new-mail
// notification (ui/mailToasts) and what it says. No React or socket, so they're unit tested.

import { Config } from "@shared/Config";
import type { MailMessage, MailSnapshot } from "@shared/types";

/** The sender's name without their job title, e.g. "Chad Thunderbuck". */
export function senderName(from: string): string {
  return from.split(" (")[0] ?? from;
}

export interface MailToast {
  // The email's id.
  id: number;
  sender: string;
  subject: string;
  snippet: string;
}

/** The emails in `snapshot` newer than `sinceId` that get a notification, oldest first:
 * unread ones, except one that opens the Email app by itself (the boss's welcome). */
export function newMailFor(snapshot: MailSnapshot, sinceId: number): MailMessage[] {
  return snapshot.messages
    .filter(
      (message) => message.id > sinceId && !message.read && message.id !== snapshot.autoOpenId,
    )
    .sort((a, b) => a.id - b.id);
}

/** The start of `body` on one line, cut at a word and ending in "..." if it's longer than
 * `maxLength`. */
export function snippetOf(body: string, maxLength: number): string {
  const line = body.replace(/\s+/g, " ").trim();
  if (line.length <= maxLength) {
    return line;
  }
  // One past the limit, so a word that ends right at it is kept.
  const lastSpace = line.slice(0, maxLength + 1).lastIndexOf(" ");
  const cut = lastSpace > 0 ? line.slice(0, lastSpace) : line.slice(0, maxLength);
  return `${cut.replace(/[\s,.;:!?-]+$/, "")}...`;
}

/** The notification for `message`. */
export function toastFor(message: MailMessage): MailToast {
  return {
    id: message.id,
    sender: senderName(message.from),
    subject: message.subject,
    snippet: snippetOf(message.body, Config.Toasts.SnippetLength),
  };
}

/** `queue` after `snapshot` arrived: emails that have since been read (or dropped) go, then
 * `arrived` joins the end, keeping only the newest Config.Toasts.MaxQueued. */
export function updateQueue(
  queue: readonly MailToast[],
  snapshot: MailSnapshot,
  arrived: readonly MailToast[],
): MailToast[] {
  const unread = new Set(
    snapshot.messages.filter((message) => !message.read).map((message) => message.id),
  );
  return [...queue.filter((toast) => unread.has(toast.id)), ...arrived].slice(
    -Config.Toasts.MaxQueued,
  );
}
