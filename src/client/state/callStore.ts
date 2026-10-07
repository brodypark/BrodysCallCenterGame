// The client's copy of the player's calls: the last snapshot the server sent. Apps render
// it; only the server changes it.

import type { CallSnapshot } from "@shared/types";
import { socket } from "@client/net/socket";
import { createStore, useStore } from "@client/state/createStore";

const NoCalls: CallSnapshot = { status: "idle", caller: null, transcript: null, lastOutcome: null };

const calls = createStore<CallSnapshot>(NoCalls);

function onSnapshot(snapshot: CallSnapshot): void {
  calls.set(snapshot);
}

socket.on("call:snapshot", onSnapshot);

// When Vite hot-reloads this module in development, remove the old copy's listener.
import.meta.hot?.dispose(() => {
  socket.off("call:snapshot", onSnapshot);
});

/** The latest call snapshot; re-renders the component when it changes. */
export function useCall(): CallSnapshot {
  return useStore(calls);
}
