// The client's copy of Skibidi's live audit on the current call (or the last call's result),
// as the server last sent it. null for none.

import type { AuditSnapshot } from "@shared/types";
import { socket } from "@client/net/socket";
import { createStore, useStore } from "@client/state/createStore";

const audit = createStore<AuditSnapshot | null>(null);

function onSnapshot(snapshot: AuditSnapshot | null): void {
  audit.set(snapshot);
}

socket.on("audit:snapshot", onSnapshot);

// When Vite hot-reloads this module in development, remove the old copy's listener.
import.meta.hot?.dispose(() => {
  socket.off("audit:snapshot", onSnapshot);
});

/** The latest audit; re-renders the component when it changes. */
export function useAudit(): AuditSnapshot | null {
  return useStore(audit);
}
