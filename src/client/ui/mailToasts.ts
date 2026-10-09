// New-mail notifications: the queue of them waiting to be shown (ui/Toasts shows them). Which
// emails get one is in ui/mailRules. Only mail that arrives while a save is being played gets
// one: picking a save (or reloading) never pops up old mail.

import { createStore, useStore } from "@client/state/createStore";
import { mailStore, newestId } from "@client/state/mailStore";
import { savesStore } from "@client/state/savesStore";
import { type MailToast, newMailFor, toastFor, updateQueue } from "@client/ui/mailRules";

const toasts = createStore<readonly MailToast[]>([]);

// The save being played, and the newest email id it had when the inbox last changed. null
// while no save is picked.
let lastSlot: number | null = savesStore.get()?.activeSlot ?? null;
let lastNewest: number | null = null;

// A save's inbox arrives just before the server says it's being played, so the newest id is
// taken from the inbox already here.
function onSavesChanged(): void {
  const slot = savesStore.get()?.activeSlot ?? null;
  if (slot !== lastSlot) {
    lastSlot = slot;
    lastNewest = slot === null ? null : newestId(mailStore.get());
    toasts.set([]);
  }
}

function onMailChanged(): void {
  const snapshot = mailStore.get();
  const arrived =
    lastNewest === null ? [] : newMailFor(snapshot, lastNewest).map((message) => toastFor(message));
  const next = updateQueue(toasts.get(), snapshot, arrived);
  if (next.length !== toasts.get().length || arrived.length > 0) {
    toasts.set(next);
  }
  lastNewest = lastSlot === null ? null : newestId(snapshot);
}

export type { MailToast };

/** Takes notification `id` off the screen (the email stays in the inbox). */
export function dismissToast(id: number): void {
  toasts.set(toasts.get().filter((toast) => toast.id !== id));
}

/** The notifications waiting, oldest first; re-renders the component when they change. */
export function useMailToasts(): readonly MailToast[] {
  return useStore(toasts);
}

let unsubscribers: (() => void)[] = [];

/** Starts watching for new mail. Call once when the page loads. */
export function startMailToasts(): void {
  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  unsubscribers = [savesStore.subscribe(onSavesChanged), mailStore.subscribe(onMailChanged)];
}

// When Vite hot-reloads this module in development, stop the old copy.
import.meta.hot?.dispose(() => {
  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
});
